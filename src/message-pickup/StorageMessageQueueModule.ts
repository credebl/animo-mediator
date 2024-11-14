import { InjectionSymbols, type DependencyManager, type Module } from '@credo-ts/core'

import { MessagePickupRepositoryClient } from '@2060.io/message-pickup-repository-client'

export class PickupModuleConfig {
  public readonly url: string | undefined

  public constructor({ url }: { url: string }) {
    this.url = url
  }
}

export class MessagePickupRepoModule implements Module {
  public readonly config: PickupModuleConfig

  public constructor(options: { url: string }) {
    this.config = new PickupModuleConfig(options)
  }

  public register(dependencyManager: DependencyManager) {

    dependencyManager.registerInstance(PickupModuleConfig, this.config)

    dependencyManager.registerSingleton(InjectionSymbols.MessagePickupRepository, MessagePickupRepositoryClient)
  }
}
