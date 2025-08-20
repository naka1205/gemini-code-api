// OpenAI聊天完成适配器模块
// 处理聊天完成请求，包括流式和非流式

import { OpenAICore } from './core';
import type {
  OpenAIRequest,
  OpenAIResponse,
  OpenAIChoice,
  OpenAIMessage,
  GeminiRequest,
  GeminiResponse,
  GeminiCandidate,
  ContentPart,
  ToolCall,
  Tool
} from '../../types/openai';

export class OpenAIChatAdapter extends OpenAICore {
  private readonly DEFAULT_MODEL = "gemini-2.5-flash";
  private readonly SEP = "\n\n|>";

  // 处理聊天完成请求
  async completions(req: OpenAIRequest): Promise<Response> {
    try {
      const model = this.getModel(req.model);
      const body = await this.transformRequest(req);

      // 处理额外配置
      this.applyExtraConfig(req, body);

      // 处理搜索工具
      this.handleSearchTools(req, body, model);

      const TASK = req.stream ? "streamGenerateContent" : "generateContent";
      let url = `models/${model}:${TASK}`;
      if (req.stream) {
        url += "?alt=sse";
      }

      const response = await this.makeRequest(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });

      let responseBody: any = response.body;
      if (response.ok) {
        const id = "chatcmpl-" + this.generateId();
        const shared: any = {};

        if (req.stream) {
          responseBody = this.createStreamResponse(response, req, model, id, shared);
        } else {
          responseBody = await this.createNonStreamResponse(response, model, id);
        }
      }

      return new Response(responseBody, this.fixCors(response));
    } catch (err: any) {
      return this.handleError(err);
    }
  }

  // 获取模型名称
  private getModel(model?: string): string {
    if (typeof model !== "string") {
      return this.DEFAULT_MODEL;
    }

    if (model.startsWith("models/")) {
      return model.substring(7);
    }

    // 使用模型映射功能
    return this.mapOpenAIToGeminiModel(model);
  }

  // 应用额外配置
  private applyExtraConfig(req: OpenAIRequest, body: GeminiRequest): void {
    const extra = req.extra_body?.google;
    if (extra) {
      if (extra.safety_settings) {
        body.safetySettings = extra.safety_settings;
      }
      if (extra.cached_content) {
        body.cachedContent = extra.cached_content;
      }
    }
  }

  // 处理搜索工具
  private handleSearchTools(req: OpenAIRequest, body: GeminiRequest, model: string): void {
    const needsSearch = model.endsWith(":search") ||
      req.model?.endsWith("-search-preview") ||
      req.tools?.some(tool => tool.function?.name === 'googleSearch');

    if (needsSearch) {
      body.tools = body.tools || [];
      body.tools.push({ googleSearch: {} });
    }
  }

  // 创建流式响应
  private createStreamResponse(
    response: Response,
    req: OpenAIRequest,
    model: string,
    id: string,
    shared: any
  ): ReadableStream {
    const self = this;
    let buffer = "";
    let last: any[] = [];
    const streamIncludeUsage = req.stream_options?.include_usage;

    return response.body!
      .pipeThrough(new TextDecoderStream())
      .pipeThrough(new TransformStream({
        transform(chunk: string, controller) {
          const responseLineRE = /^data: (.*)(?:\n\n|\r\r|\r\n\r\n)/;
          buffer += chunk;
          do {
            const match = buffer.match(responseLineRE);
            if (!match) { break; }
            controller.enqueue(match[1]);
            buffer = buffer.substring(match[0].length);
          } while (true);
        },
        flush(controller) {
          if (buffer) {
            console.error("Invalid data:", buffer);
            controller.enqueue(buffer);
            shared.is_buffers_rest = true;
          }
        }
      }))
      .pipeThrough(new TransformStream({
        transform(line: string, controller) {
          const delimiter = "\n\n";
          const sseline = (obj: any): string => {
            obj.created = Math.floor(Date.now() / 1000);
            return "data: " + JSON.stringify(obj) + delimiter;
          };

          let data: any;
          try {
            data = JSON.parse(line);
            if (!data.candidates) {
              throw new Error("Invalid completion chunk object");
            }
          } catch (err) {
            console.error("Error parsing response:", err);
            if (!shared.is_buffers_rest) { line += delimiter; }
            controller.enqueue(line);
            return;
          }

          const obj: any = {
            id: id,
            choices: data.candidates.map((cand: any) => self.transformCandidatesDelta(cand)),
            model: data.modelVersion ?? model,
            object: "chat.completion.chunk",
            usage: data.usageMetadata && streamIncludeUsage ? null : undefined,
          };

          if (self.checkPromptBlock(obj.choices, data.promptFeedback, "delta")) {
            controller.enqueue(sseline(obj));
            return;
          }

          const cand = obj.choices[0];
          cand.index = cand.index || 0;
          const finish_reason = cand.finish_reason;
          cand.finish_reason = null;

          if (!last[cand.index]) {
            controller.enqueue(sseline({
              ...obj,
              choices: [{ ...cand, tool_calls: undefined, delta: { role: "assistant", content: "" } }],
            }));
          }

          delete cand.delta.role;
          if ("content" in cand.delta) {
            controller.enqueue(sseline(obj));
          }

          cand.finish_reason = finish_reason;
          if (data.usageMetadata && streamIncludeUsage) {
            obj.usage = self.transformUsage(data.usageMetadata);
          }

          cand.delta = {};
          last[cand.index] = obj;
        },
        flush(controller) {
          const delimiter = "\n\n";
          const sseline = (obj: any): string => {
            obj.created = Math.floor(Date.now() / 1000);
            return "data: " + JSON.stringify(obj) + delimiter;
          };

          if (last.length > 0) {
            for (const obj of last) {
              controller.enqueue(sseline(obj));
            }
            controller.enqueue("data: [DONE]" + delimiter);
          }
        }
      }))
      .pipeThrough(new TextEncoderStream());
  }

  // 创建非流式响应
  private async createNonStreamResponse(
    response: Response,
    model: string,
    id: string
  ): Promise<string> {
    let responseBody = await response.text();
    try {
      const parsedBody = JSON.parse(responseBody);
      if (!parsedBody.candidates) {
        throw new Error("Invalid completion object");
      }
      responseBody = this.processCompletionsResponse(parsedBody, model, id);
    } catch (err) {
      console.error("Error parsing response:", err);
      return responseBody; // 返回原始响应
    }
    return responseBody;
  }

  // 转换请求格式
  private async transformRequest(req: OpenAIRequest): Promise<GeminiRequest> {
    const messages = await this.transformMessages(req.messages);
    const config = this.transformConfig(req);
    const tools = this.transformTools(req);

    return {
      ...messages,
      safetySettings: this.getSafetySettings(),
      generationConfig: config,
      ...tools,
    };
  }

  // 转换配置
  private transformConfig(req: OpenAIRequest): any {
    const cfg: any = {};
    const fieldsMap = this.getFieldsMap();

    for (const key in req) {
      const matchedKey = fieldsMap[key];
      if (matchedKey) {
        cfg[matchedKey] = (req as any)[key];
      }
    }

    // 处理响应格式
    if (req.response_format) {
      this.handleResponseFormat(req.response_format, cfg);
    }

    return cfg;
  }

  // 处理响应格式
  private handleResponseFormat(format: any, cfg: any): void {
    switch (format.type) {
      case "json_schema":
        this.adjustSchema(format);
        cfg.responseSchema = format.json_schema?.schema;
        if (cfg.responseSchema && "enum" in cfg.responseSchema) {
          cfg.responseMimeType = "text/x.enum";
          break;
        }
      // fall through
      case "json_object":
        cfg.responseMimeType = "application/json";
        break;
      case "text":
        cfg.responseMimeType = "text/plain";
        break;
      default:
        throw new Error("Unsupported response_format.type");
    }
  }

  // 调整schema
  private adjustSchema(schema: any): void {
    const adjustProps = (schemaPart: any): void => {
      if (typeof schemaPart !== "object" || schemaPart === null) {
        return;
      }
      if (Array.isArray(schemaPart)) {
        schemaPart.forEach(adjustProps);
      } else {
        if (schemaPart.type === "object" && schemaPart.properties && schemaPart.additionalProperties === false) {
          delete schemaPart.additionalProperties;
        }
        Object.values(schemaPart).forEach(adjustProps);
      }
    };

    const obj = schema[schema.type];
    delete obj.strict;
    adjustProps(schema);
  }

  // 转换消息
  private async transformMessages(messages?: OpenAIMessage[]): Promise<{ system_instruction?: any; contents?: any[] }> {
    if (!messages) {
      return {};
    }

    const contents: any[] = [];
    let system_instruction: any;

    for (const item of messages) {
      switch (item.role) {
        case "system":
          system_instruction = { parts: await this.transformMsg(item) };
          continue;
        case "tool":
          let { role, parts } = contents[contents.length - 1] ?? {};
          if (role !== "function") {
            const calls = parts?.calls;
            parts = [];
            parts.calls = calls;
            contents.push({
              role: "function",
              parts
            });
          }
          this.transformFnResponse(item as any, parts);
          continue;
        case "assistant":
          (item as any).role = "model";
          break;
        case "user":
          break;
        default:
          throw new Error(`Unknown message role: "${item.role}"`);
      }

      contents.push({
        role: item.role,
        parts: item.tool_calls ? this.transformFnCalls(item as any) : await this.transformMsg(item)
      });
    }

    if (system_instruction) {
      if (!contents[0]?.parts.some((part: any) => part.text)) {
        contents.unshift({ role: "user", parts: [{ text: " " }] });
      }
    }

    return { system_instruction, contents };
  }

  // 转换消息内容
  private async transformMsg({ content }: { content: string | ContentPart[] | null }): Promise<any[]> {
    const parts: any[] = [];
    if (!Array.isArray(content)) {
      parts.push({ text: content });
      return parts;
    }

    for (const item of content) {
      switch (item.type) {
        case "text":
          parts.push({ text: item.text });
          break;
        case "image_url":
          if (item.image_url) {
            parts.push(await this.parseImg(item.image_url.url));
          }
          break;
        case "input_audio":
          if (item.input_audio) {
            parts.push({
              inlineData: {
                mimeType: "audio/" + item.input_audio.format,
                data: item.input_audio.data,
              }
            });
          }
          break;
        default:
          throw new Error(`Unknown "content" item type: "${item.type}"`);
      }
    }

    if (content.every(item => item.type === "image_url")) {
      parts.push({ text: "" });
    }

    return parts;
  }

  // 转换函数调用
  private transformFnCalls({ tool_calls }: { tool_calls: ToolCall[] }): any {
    const calls: Record<string, any> = {};
    const parts = tool_calls.map(({ function: { arguments: argstr, name }, id, type }, i) => {
      if (type !== "function") {
        throw new Error(`Unsupported tool_call type: "${type}"`);
      }

      let args: any;
      try {
        args = JSON.parse(argstr);
      } catch (err) {
        console.error("Error parsing function arguments:", err);
        throw new Error("Invalid function arguments: " + argstr);
      }

      calls[id] = { i, name };
      return {
        functionCall: {
          id: id.startsWith("call_") ? null : id,
          name,
          args,
        }
      };
    });

    (parts as any).calls = calls;
    return parts;
  }

  // 转换函数响应
  private transformFnResponse({ content, tool_call_id }: { content: string; tool_call_id?: string }, parts: any): void {
    if (!parts.calls) {
      throw new Error("No function calls found in the previous message");
    }

    let response: any;
    try {
      response = JSON.parse(content);
    } catch (err) {
      console.error("Error parsing function response content:", err);
      throw new Error("Invalid function response: " + content);
    }

    if (typeof response !== "object" || response === null || Array.isArray(response)) {
      response = { result: response };
    }

    if (!tool_call_id) {
      throw new Error("tool_call_id not specified");
    }

    const { i, name } = parts.calls[tool_call_id] ?? {};
    if (!name) {
      throw new Error("Unknown tool_call_id: " + tool_call_id);
    }

    if (parts[i]) {
      throw new Error("Duplicated tool_call_id: " + tool_call_id);
    }

    parts[i] = {
      functionResponse: {
        id: tool_call_id.startsWith("call_") ? null : tool_call_id,
        name,
        response,
      }
    };
  }

  // 转换工具
  private transformTools(req: OpenAIRequest): { tools?: any[]; tool_config?: any } {
    let tools: any[] | undefined, tool_config: any;

    if (req.tools) {
      const funcs = req.tools.filter(tool => tool.type === "function" && tool.function?.name !== 'googleSearch');
      if (funcs.length > 0) {
        funcs.forEach(func => this.adjustSchema(func));
        tools = [{ function_declarations: funcs.map(schema => schema.function) }];
      }
    }

    if (req.tool_choice) {
      const allowed_function_names = typeof req.tool_choice === 'object' && req.tool_choice.type === "function"
        ? [req.tool_choice.function?.name]
        : undefined;

      if (allowed_function_names || typeof req.tool_choice === "string") {
        tool_config = {
          function_calling_config: {
            mode: allowed_function_names ? "ANY" : (req.tool_choice as string).toUpperCase(),
            allowed_function_names
          }
        };
      }
    }

    return { tools, tool_config };
  }

  // 处理完成响应
  private processCompletionsResponse(data: GeminiResponse, model: string, id: string): string {
    const obj: OpenAIResponse = {
      id,
      choices: data.candidates?.map(cand => this.transformCandidatesMessage(cand)) || [],
      created: Math.floor(Date.now() / 1000),
      model: data.modelVersion ?? model,
      object: "chat.completion",
      usage: data.usageMetadata && this.transformUsage(data.usageMetadata),
    };

    if (obj.choices.length === 0) {
      this.checkPromptBlock(obj.choices, data.promptFeedback, "message");
    }

    return JSON.stringify(obj);
  }

  // 转换候选消息
  private transformCandidatesMessage(cand: GeminiCandidate): OpenAIChoice {
    return this.transformCandidates("message", cand);
  }

  // 转换候选增量
  private transformCandidatesDelta(cand: GeminiCandidate): OpenAIChoice {
    return this.transformCandidates("delta", cand);
  }

  // 转换候选
  private transformCandidates(key: string, cand: GeminiCandidate): OpenAIChoice {
    const message: any = { role: "assistant", content: [] };

    // 处理常规内容
    for (const part of cand.content?.parts ?? []) {
      if (part.functionCall) {
        const fc = part.functionCall;
        message.tool_calls = message.tool_calls ?? [];
        message.tool_calls.push({
          id: fc.id ?? "call_" + this.generateId(),
          type: "function",
          function: {
            name: fc.name,
            arguments: JSON.stringify(fc.args),
          }
        });
      } else if (part.text) {
        message.content.push(part.text);
      }
    }

    message.content = message.content.join(this.SEP) || null;
    const reasonsMap = this.getReasonsMap();

    return {
      index: cand.index || 0,
      [key]: message,
      logprobs: null,
      finish_reason: message.tool_calls ? "tool_calls" : reasonsMap[cand.finishReason || ""] || cand.finishReason || null,
    };
  }

  // 转换使用情况
  private transformUsage(data: any) {
    return {
      completion_tokens: data.candidatesTokenCount,
      prompt_tokens: data.promptTokenCount,
      total_tokens: data.totalTokenCount
    };
  }

  // 检查提示阻塞
  private checkPromptBlock(choices: OpenAIChoice[], promptFeedback: any, key: string): boolean {
    if (choices.length) {
      return false;
    }

    if (promptFeedback?.blockReason) {
      console.log("Prompt block reason:", promptFeedback.blockReason);
      if (promptFeedback.blockReason === "SAFETY") {
        promptFeedback.safetyRatings
          ?.filter((r: any) => r.blocked)
          .forEach((r: any) => console.log(r));
      }
      choices.push({
        index: 0,
        [key]: null,
        logprobs: null,
        finish_reason: "content_filter",
      });
    }
    return true;
  }


}