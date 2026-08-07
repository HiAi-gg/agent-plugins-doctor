// Client profile registry: stores verified Agent Plugins client profiles by
// id. The default registry loads the profiles from data/clients.json.

import type { ClientProfile } from './types.js';
import clientsData from './data/clients.json';

export class ClientProfileRegistry {
  private profiles: Map<string, ClientProfile> = new Map();

  /**
   * Register a client profile. Throws if a profile with the same id already
   * exists, so verified profiles cannot be silently shadowed.
   */
  register(profile: ClientProfile): void {
    if (this.profiles.has(profile.id)) {
      throw new Error(`Client profile already registered: ${profile.id}`);
    }
    this.profiles.set(profile.id, profile);
  }

  get(id: string): ClientProfile | undefined {
    return this.profiles.get(id);
  }

  getAll(): ClientProfile[] {
    return [...this.profiles.values()];
  }

  clear(): void {
    this.profiles.clear();
  }
}

/** Registry pre-populated with the verified client profiles. */
export function createDefaultClientRegistry(): ClientProfileRegistry {
  const registry = new ClientProfileRegistry();
  const clients = (clientsData as { clients: ClientProfile[] }).clients;
  for (const profile of clients) {
    registry.register(profile);
  }
  return registry;
}
