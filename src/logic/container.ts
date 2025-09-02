// src/logic/container.ts
export class Container {
  private static instance: Container;
  private services: Map<string, any> = new Map();
  
  private constructor() {} // Private constructor to enforce singleton pattern

  static getInstance(): Container {
    if (!Container.instance) {
      Container.instance = new Container();
    }
    return Container.instance;
  }
  
  register<T>(name: string, factory: () => T): void {
    // We store the factory function itself.
    // The instance will be created only when it's first requested.
    this.services.set(name, { factory, instance: null });
  }
  
  get<T>(name: string): T {
    const service = this.services.get(name);
    if (!service) {
      throw new Error(`Service not found: ${name}`);
    }

    // Singleton behavior: if the instance hasn't been created, create it.
    if (!service.instance) {
      service.instance = service.factory();
    }
    
    return service.instance as T;
  }
}