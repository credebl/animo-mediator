import { AskarModule, AskarMultiWalletDatabaseScheme } from '@credo-ts/askar'
import {
  Agent,
  CacheModule,
  ConnectionsModule,
  DidCommMimeType,
  HttpOutboundTransport,
  InjectionSymbols,
  InMemoryLruCache,
  MediatorModule,
  OutOfBandRole,
  OutOfBandState,
  WalletConfig,
  WsOutboundTransport,
} from '@credo-ts/core'
import { HttpInboundTransport, WsInboundTransport, agentDependencies } from '@credo-ts/node'
import { ariesAskar } from '@hyperledger/aries-askar-nodejs'
import type { Socket } from 'net'

import express from 'express'
import { Server } from 'ws'

import { AGENT_ENDPOINTS, AGENT_NAME, AGENT_PORT, LOG_LEVEL, POSTGRES_HOST, WALLET_KEY, WALLET_NAME } from './constants'
import { askarPostgresConfig } from './database'
import { Logger } from './logger'
import { StorageMessageQueueModule } from './storage/StorageMessageQueueModule'
import { PushNotificationsFcmModule } from './push-notifications/fcm'
import { MessagePickupRepositoryClient } from '@2060.io/message-pickup-repository-client'
import { MessageForwardingStrategy } from '@credo-ts/core/build/modules/routing/MessageForwardingStrategy'

function createModules() {
  const modules = {
    // storageModule: new StorageMessageQueueModule(),
    // storageModule: new MessagePickupRepositoryClient({
    //   url: ""
    // }),
    // storageModule: new MessagePickupRepoModule({
    //   url: "redis://127.0.0.1:6379"
    // }),
    connections: new ConnectionsModule({
      autoAcceptConnections: true,
    }),
    mediator: new MediatorModule({
      autoAcceptMediationRequests: true,
      messageForwardingStrategy: MessageForwardingStrategy.DirectDelivery
    }),
    askar: new AskarModule({
      ariesAskar,
      multiWalletDatabaseScheme: AskarMultiWalletDatabaseScheme.ProfilePerWallet,
    }),
    pushNotificationsFcm: new PushNotificationsFcmModule(),
  }

  return modules
}

export async function createAgent() {
  // We create our own instance of express here. This is not required
  // but allows use to use the same server (and port) for both WebSockets and HTTP
  const app = express()
  const socketServer = new Server({ noServer: true })

  const logger = new Logger(LOG_LEVEL)

  // Only load postgres database in production
  const storageConfig = POSTGRES_HOST ? askarPostgresConfig : undefined

  const walletConfig: WalletConfig = {
    id: WALLET_NAME,
    key: WALLET_KEY,
    storage: storageConfig,
  }

  if (storageConfig) {
    logger.info('Using postgres storage', {
      walletId: walletConfig.id,
      host: storageConfig.config.host,
    })
  } else {
    logger.info('Using SQlite storage', {
      walletId: walletConfig.id,
    })
  }

  const agent = new Agent({
    config: {
      label: AGENT_NAME,
      endpoints: AGENT_ENDPOINTS,
      walletConfig: walletConfig,
      useDidSovPrefixWhereAllowed: true,
      logger: logger,
      autoUpdateStorageOnStartup: true,
      backupBeforeStorageUpdate: false,
      didCommMimeType: DidCommMimeType.V0,
    },
    dependencies: agentDependencies,
    modules: {
      ...createModules(),
    },
  })

  // Create all transports
  const httpInboundTransport = new HttpInboundTransport({ app, port: AGENT_PORT })
  const httpOutboundTransport = new HttpOutboundTransport()
  const wsInboundTransport = new WsInboundTransport({ server: socketServer })
  const wsOutboundTransport = new WsOutboundTransport()

  // Register all Transports
  agent.registerInboundTransport(httpInboundTransport)
  agent.registerOutboundTransport(httpOutboundTransport)
  agent.registerInboundTransport(wsInboundTransport)
  agent.registerOutboundTransport(wsOutboundTransport)

  // Added health check endpoint
  httpInboundTransport.app.get('/health', async (_req, res) => {
    res.status(200).send('Ok')
  })

  // eslint-disable-next-line @typescript-eslint/no-misused-promises
  httpInboundTransport.app.get('/invite', async (req, res) => {
    if (!req.query._oobid || typeof req.query._oobid !== 'string') {
      return res.status(400).send('Missing or invalid _oobid')
    }

    const outOfBandRecord = await agent.oob.findById(req.query._oobid)

    if (
      !outOfBandRecord ||
      outOfBandRecord.role !== OutOfBandRole.Sender ||
      outOfBandRecord.state !== OutOfBandState.AwaitResponse
    ) {
      return res.status(400).send(`No invitation found for _oobid ${req.query._oobid}`)
    }
    return res.send(outOfBandRecord.outOfBandInvitation.toJSON())
  })

  const client = new MessagePickupRepositoryClient({
    url: `${process.env.MESSAGE_PICKUP_REPOSITORY_URL}`,
  })

  await client.connect()

  agent.dependencyManager.registerInstance(InjectionSymbols.MessagePickupRepository, client)

  await agent.initialize()

  // When an 'upgrade' to WS is made on our http server, we forward the
  // request to the WS server
  httpInboundTransport.server?.on('upgrade', (request, socket, head) => {
    socketServer.handleUpgrade(request, socket as Socket, head, (socket) => {
      socketServer.emit('connection', socket, request)
    })
  })

  return agent
}

export type MediatorAgent = Agent<ReturnType<typeof createModules>>
