import { Sequelize } from 'sequelize'
import gql from 'graphql-tag'
import { ethers } from 'ethers'
import {
  connectDatabase,
  connectContracts,
  createLogger,
  Logger,
  NetworkContracts,
  parseGRT,
} from '@graphprotocol/common-ts'

import {
  createIndexerManagementClient,
  IndexerManagementClient,
  IndexerManagementDefaults,
} from '../client'
import {
  defineIndexerManagementModels,
  IndexerManagementModels,
  IndexingDecisionBasis,
  INDEXING_RULE_GLOBAL,
} from '../models'
import {
  IndexingStatusResolver,
  NetworkSubgraph,
  SubgraphIdentifierType,
} from '@graphprotocol/indexer-common'

// Make global Jest variable available
// eslint-disable-next-line @typescript-eslint/no-explicit-any
declare const __DATABASE__: any

const SET_INDEXING_RULE_MUTATION = gql`
  mutation setIndexingRule($rule: IndexingRuleInput!) {
    setIndexingRule(rule: $rule) {
      identifier
      identifierType
      allocationAmount
      parallelAllocations
      maxAllocationPercentage
      minSignal
      maxSignal
      minStake
      minAverageQueryFees
      custom
      decisionBasis
    }
  }
`

const DELETE_INDEXING_RULE_MUTATION = gql`
  mutation deleteIndexingRule($identifier: String!) {
    deleteIndexingRule(identifier: $identifier)
  }
`

const DELETE_INDEXING_RULES_MUTATION = gql`
  mutation deleteIndexingRules($identifiers: [String!]!) {
    deleteIndexingRules(identifiers: $identifiers)
  }
`

const INDEXING_RULE_QUERY = gql`
  query indexingRule($identifier: String!, $merged: Boolean!) {
    indexingRule(identifier: $identifier, merged: $merged) {
      identifier
      identifierType
      allocationAmount
      parallelAllocations
      maxAllocationPercentage
      minSignal
      maxSignal
      minStake
      minAverageQueryFees
      custom
      decisionBasis
    }
  }
`

const INDEXING_RULES_QUERY = gql`
  query indexingRuls($merged: Boolean!) {
    indexingRules(merged: $merged) {
      identifier
      identifierType
      allocationAmount
      parallelAllocations
      maxAllocationPercentage
      minSignal
      maxSignal
      minStake
      minAverageQueryFees
      custom
      decisionBasis
    }
  }
`

let sequelize: Sequelize
let models: IndexerManagementModels
let address: string
let contracts: NetworkContracts
let logger: Logger
let indexingStatusResolver: IndexingStatusResolver
let networkSubgraph: NetworkSubgraph
let client: IndexerManagementClient

const defaults: IndexerManagementDefaults = {
  globalIndexingRule: {
    allocationAmount: parseGRT('100'),
    parallelAllocations: 1,
  },
}

describe('Indexing rules', () => {
  beforeEach(async () => {
    // Spin up db
    sequelize = await connectDatabase(__DATABASE__)
    models = defineIndexerManagementModels(sequelize)
    address = '0xtest'
    contracts = await connectContracts(ethers.getDefaultProvider('rinkeby'), 4)
    await sequelize.sync({ force: true })
    logger = createLogger({ name: 'Indexer API Client', level: 'trace' })
    indexingStatusResolver = new IndexingStatusResolver({
      logger: logger,
      statusEndpoint: 'http://localhost:8030/graphql',
    })
    networkSubgraph = await NetworkSubgraph.create({
      logger,
      endpoint: 'https://gateway.testnet.thegraph.com/network',
      deployment: undefined,
    })
    client = await createIndexerManagementClient({
      models,
      address,
      contracts,
      indexingStatusResolver,
      networkSubgraph,
      logger,
      defaults,
      features: {
        injectDai: true,
      },
    })
  })

  afterEach(async () => {
    await sequelize.drop({})
  })

  test('Set and get global rule (partial)', async () => {
    const input = {
      identifier: INDEXING_RULE_GLOBAL,
      identifierType: SubgraphIdentifierType.GROUP,
      allocationAmount: '1000',
    }

    const expected = {
      ...input,
      parallelAllocations: null,
      maxAllocationPercentage: null,
      minSignal: null,
      maxSignal: null,
      minStake: null,
      minAverageQueryFees: null,
      custom: null,
      decisionBasis: IndexingDecisionBasis.RULES,
    }

    // Update the rule and ensure the right data is returned
    await expect(
      client.mutation(SET_INDEXING_RULE_MUTATION, { rule: input }).toPromise(),
    ).resolves.toHaveProperty('data.setIndexingRule', expected)

    // Query the rule to make sure it's updated in the db
    await expect(
      client
        .query(INDEXING_RULE_QUERY, { identifier: INDEXING_RULE_GLOBAL, merged: false })
        .toPromise(),
    ).resolves.toHaveProperty('data.indexingRule', expected)
  })

  test('Set and get global rule (complete)', async () => {
    const input = {
      identifier: INDEXING_RULE_GLOBAL,
      identifierType: SubgraphIdentifierType.GROUP,
      allocationAmount: '1',
      parallelAllocations: 1,
      maxAllocationPercentage: 0.5,
      minSignal: '2',
      maxSignal: '3',
      minStake: '4',
      minAverageQueryFees: '5',
      custom: JSON.stringify({ foo: 'bar' }),
      decisionBasis: IndexingDecisionBasis.RULES,
    }

    const expected = {
      ...input,
    }

    // Update the rule
    await expect(
      client.mutation(SET_INDEXING_RULE_MUTATION, { rule: input }).toPromise(),
    ).resolves.toHaveProperty('data.setIndexingRule', expected)

    // Query the rule to make sure it's updated in the db
    await expect(
      client
        .query(INDEXING_RULE_QUERY, { identifier: INDEXING_RULE_GLOBAL, merged: false })
        .toPromise(),
    ).resolves.toHaveProperty('data.indexingRule', expected)
  })

  test('Set and get global rule (partial update)', async () => {
    const originalInput = {
      identifier: INDEXING_RULE_GLOBAL,
      identifierType: SubgraphIdentifierType.GROUP,
      allocationAmount: '1',
      minSignal: '2',
    }

    const original = {
      ...originalInput,
      parallelAllocations: null,
      maxAllocationPercentage: null,
      maxSignal: null,
      minStake: null,
      minAverageQueryFees: null,
      custom: null,
      decisionBasis: IndexingDecisionBasis.RULES,
    }

    // Write the original
    await expect(
      client.mutation(SET_INDEXING_RULE_MUTATION, { rule: originalInput }).toPromise(),
    ).resolves.toHaveProperty('data.setIndexingRule', original)

    const update = {
      identifier: INDEXING_RULE_GLOBAL,
      identifierType: SubgraphIdentifierType.GROUP,
      allocationAmount: null,
      maxSignal: '3',
      decisionBasis: IndexingDecisionBasis.OFFCHAIN,
    }

    const expected = {
      ...original,
      ...update,
    }

    // Update the rule
    await expect(
      client.mutation(SET_INDEXING_RULE_MUTATION, { rule: update }).toPromise(),
    ).resolves.toHaveProperty('data.setIndexingRule', expected)

    // Query the rule to make sure it's updated in the db
    await expect(
      client
        .query(INDEXING_RULE_QUERY, { identifier: INDEXING_RULE_GLOBAL, merged: false })
        .toPromise(),
    ).resolves.toHaveProperty('data.indexingRule', expected)
  })

  test('Set and get deployment rule (partial update)', async () => {
    const originalInput = {
      identifier: '0xa4e311bfa7edabed7b31d93e0b3e751659669852ef46adbedd44dc2454db4bf3',
      identifierType: SubgraphIdentifierType.DEPLOYMENT,
      allocationAmount: '1',
      minSignal: '2',
      decisionBasis: IndexingDecisionBasis.OFFCHAIN,
    }

    const original = {
      ...originalInput,
      parallelAllocations: null,
      maxAllocationPercentage: null,
      maxSignal: null,
      minStake: null,
      minAverageQueryFees: null,
      custom: null,
      decisionBasis: IndexingDecisionBasis.OFFCHAIN,
    }

    // Write the orginal
    await expect(
      client.mutation(SET_INDEXING_RULE_MUTATION, { rule: originalInput }).toPromise(),
    ).resolves.toHaveProperty('data.setIndexingRule', original)

    const update = {
      identifier: '0xa4e311bfa7edabed7b31d93e0b3e751659669852ef46adbedd44dc2454db4bf3',
      identifierType: SubgraphIdentifierType.DEPLOYMENT,
      allocationAmount: null,
      maxSignal: '3',
      decisionBasis: IndexingDecisionBasis.ALWAYS,
    }

    const expected = {
      ...original,
      ...update,
    }

    // Update the rule
    await expect(
      client.mutation(SET_INDEXING_RULE_MUTATION, { rule: update }).toPromise(),
    ).resolves.toHaveProperty('data.setIndexingRule', expected)

    // Query the rule to make sure it's updated in the db
    await expect(
      client
        .query(INDEXING_RULE_QUERY, {
          identifier:
            '0xa4e311bfa7edabed7b31d93e0b3e751659669852ef46adbedd44dc2454db4bf3',
          merged: false,
        })
        .toPromise(),
    ).resolves.toHaveProperty('data.indexingRule', expected)

    const updateAgain = {
      identifier: '0xa4e311bfa7edabed7b31d93e0b3e751659669852ef46adbedd44dc2454db4bf3',
      identifierType: SubgraphIdentifierType.DEPLOYMENT,
      decisionBasis: IndexingDecisionBasis.NEVER,
    }

    const expectedAgain = {
      ...original,
      ...update,
      ...updateAgain,
    }

    // Update the rule
    await expect(
      client.mutation(SET_INDEXING_RULE_MUTATION, { rule: updateAgain }).toPromise(),
    ).resolves.toHaveProperty('data.setIndexingRule', expectedAgain)

    // Query the rule to make sure it's updated in the db
    await expect(
      client
        .query(INDEXING_RULE_QUERY, {
          identifier:
            '0xa4e311bfa7edabed7b31d93e0b3e751659669852ef46adbedd44dc2454db4bf3',
          merged: false,
        })
        .toPromise(),
    ).resolves.toHaveProperty('data.indexingRule', expectedAgain)
  })

  test('Set and get global and deployment rule', async () => {
    const globalInput = {
      identifier: INDEXING_RULE_GLOBAL,
      identifierType: SubgraphIdentifierType.GROUP,
      allocationAmount: '1',
      minSignal: '1',
      decisionBasis: IndexingDecisionBasis.NEVER,
    }

    const deploymentInput = {
      identifier: '0xa4e311bfa7edabed7b31d93e0b3e751659669852ef46adbedd44dc2454db4bf3',
      identifierType: SubgraphIdentifierType.DEPLOYMENT,
      allocationAmount: '1',
      minSignal: '2',
      decisionBasis: IndexingDecisionBasis.OFFCHAIN,
    }

    const globalExpected = {
      ...globalInput,
      parallelAllocations: null,
      maxAllocationPercentage: null,
      maxSignal: null,
      minStake: null,
      minAverageQueryFees: null,
      custom: null,
      decisionBasis: IndexingDecisionBasis.NEVER,
    }

    const deploymentExpected = {
      ...deploymentInput,
      parallelAllocations: null,
      maxAllocationPercentage: null,
      maxSignal: null,
      minStake: null,
      minAverageQueryFees: null,
      custom: null,
      decisionBasis: IndexingDecisionBasis.OFFCHAIN,
    }

    // Write the orginals
    await expect(
      client.mutation(SET_INDEXING_RULE_MUTATION, { rule: globalInput }).toPromise(),
    ).resolves.toHaveProperty('data.setIndexingRule', globalExpected)
    await expect(
      client.mutation(SET_INDEXING_RULE_MUTATION, { rule: deploymentInput }).toPromise(),
    ).resolves.toHaveProperty('data.setIndexingRule', deploymentExpected)

    // Query the global rule
    await expect(
      client
        .query(INDEXING_RULE_QUERY, {
          identifier: INDEXING_RULE_GLOBAL,
          merged: false,
        })
        .toPromise(),
    ).resolves.toHaveProperty('data.indexingRule', globalExpected)

    // Query the rule for the deployment
    await expect(
      client
        .query(INDEXING_RULE_QUERY, {
          identifier:
            '0xa4e311bfa7edabed7b31d93e0b3e751659669852ef46adbedd44dc2454db4bf3',
          merged: false,
        })
        .toPromise(),
    ).resolves.toHaveProperty('data.indexingRule', deploymentExpected)

    // Query all rules together
    await expect(
      client.query(INDEXING_RULES_QUERY, { merged: false }).toPromise(),
    ).resolves.toHaveProperty('data.indexingRules', [globalExpected, deploymentExpected])
  })

  test('Set, delete and get rule', async () => {
    const input = {
      identifier: '0xa4e311bfa7edabed7b31d93e0b3e751659669852ef46adbedd44dc2454db4bf3',
      identifierType: SubgraphIdentifierType.DEPLOYMENT,
      allocationAmount: '1',
      minSignal: '2',
    }

    const expected = {
      ...input,
      parallelAllocations: null,
      maxAllocationPercentage: null,
      maxSignal: null,
      minStake: null,
      minAverageQueryFees: null,
      custom: null,
      decisionBasis: IndexingDecisionBasis.RULES,
    }

    // Write the rule
    await expect(
      client.mutation(SET_INDEXING_RULE_MUTATION, { rule: input }).toPromise(),
    ).resolves.toHaveProperty('data.setIndexingRule', expected)

    // Query all rules
    await expect(
      client.query(INDEXING_RULES_QUERY, { merged: false }).toPromise(),
    ).resolves.toHaveProperty('data.indexingRules', [expected])

    // Delete the rule
    await expect(
      client
        .mutation(DELETE_INDEXING_RULE_MUTATION, { identifier: expected.identifier })
        .toPromise(),
    ).resolves.toHaveProperty('data.deleteIndexingRule', true)

    // Query all rules together
    await expect(
      client.query(INDEXING_RULES_QUERY, { merged: false }).toPromise(),
    ).resolves.toHaveProperty('data.indexingRules', [])
  })

  test('Clear a parameter', async () => {
    const input = {
      identifier: '0xa4e311bfa7edabed7b31d93e0b3e751659669852ef46adbedd44dc2454db4bf3',
      identifierType: SubgraphIdentifierType.DEPLOYMENT,
      allocationAmount: '1',
    }

    const expectedBefore = {
      ...input,
      parallelAllocations: null,
      maxAllocationPercentage: null,
      minSignal: null,
      maxSignal: null,
      minStake: null,
      minAverageQueryFees: null,
      custom: null,
      decisionBasis: IndexingDecisionBasis.RULES,
    }

    // Write the rule
    await expect(
      client.mutation(SET_INDEXING_RULE_MUTATION, { rule: input }).toPromise(),
    ).resolves.toHaveProperty('data.setIndexingRule', expectedBefore)

    // Query all rules
    await expect(
      client.query(INDEXING_RULES_QUERY, { merged: false }).toPromise(),
    ).resolves.toHaveProperty('data.indexingRules', [expectedBefore])

    // Clear the allocationAmount field
    await expect(
      client
        .mutation(SET_INDEXING_RULE_MUTATION, {
          rule: { ...expectedBefore, allocationAmount: null },
        })
        .toPromise(),
    ).resolves.toHaveProperty('data.setIndexingRule', {
      ...expectedBefore,
      allocationAmount: null,
    })

    // Query the rules again to see that the update went through
    await expect(
      client.query(INDEXING_RULES_QUERY, { merged: false }).toPromise(),
    ).resolves.toHaveProperty('data.indexingRules', [
      { ...expectedBefore, allocationAmount: null },
    ])
  })

  test('Set and get global and deployment rule (merged)', async () => {
    const globalInput = {
      identifier: INDEXING_RULE_GLOBAL,
      identifierType: SubgraphIdentifierType.GROUP,
      allocationAmount: '1',
      minSignal: '1',
      decisionBasis: IndexingDecisionBasis.NEVER,
      minAverageQueryFees: '1',
    }

    const deploymentInput = {
      identifier: '0xa4e311bfa7edabed7b31d93e0b3e751659669852ef46adbedd44dc2454db4bf3',
      identifierType: SubgraphIdentifierType.DEPLOYMENT,
      allocationAmount: '1',
      minSignal: '2',
      decisionBasis: IndexingDecisionBasis.OFFCHAIN,
    }

    const globalExpected = {
      ...globalInput,
      parallelAllocations: null,
      maxAllocationPercentage: null,
      maxSignal: null,
      minStake: null,
      custom: null,
      decisionBasis: IndexingDecisionBasis.NEVER,
    }

    const deploymentExpected = {
      ...deploymentInput,
      parallelAllocations: null,
      maxAllocationPercentage: null,
      maxSignal: null,
      minStake: null,
      minAverageQueryFees: null,
      custom: null,
      decisionBasis: IndexingDecisionBasis.OFFCHAIN,
    }

    const deploymentMergedExpected = {
      ...deploymentInput,
      parallelAllocations: null,
      maxAllocationPercentage: null,
      maxSignal: null,
      minStake: null,
      minAverageQueryFees: '1',
      custom: null,
      decisionBasis: IndexingDecisionBasis.OFFCHAIN,
    }

    // Write the orginals
    await expect(
      client.mutation(SET_INDEXING_RULE_MUTATION, { rule: globalInput }).toPromise(),
    ).resolves.toHaveProperty('data.setIndexingRule', globalExpected)
    await expect(
      client.mutation(SET_INDEXING_RULE_MUTATION, { rule: deploymentInput }).toPromise(),
    ).resolves.toHaveProperty('data.setIndexingRule', deploymentExpected)

    // Query the global rule
    await expect(
      client
        .query(INDEXING_RULE_QUERY, {
          identifier: INDEXING_RULE_GLOBAL,
          merged: false,
        })
        .toPromise(),
    ).resolves.toHaveProperty('data.indexingRule', globalExpected)

    // Query the rule for the deployment merged with the global rule
    await expect(
      client
        .query(INDEXING_RULE_QUERY, {
          identifier:
            '0xa4e311bfa7edabed7b31d93e0b3e751659669852ef46adbedd44dc2454db4bf3',
          merged: true,
        })
        .toPromise(),
    ).resolves.toHaveProperty('data.indexingRule', deploymentMergedExpected)

    // Query all rules together (without merging)
    await expect(
      client.query(INDEXING_RULES_QUERY, { merged: false }).toPromise(),
    ).resolves.toHaveProperty('data.indexingRules', [globalExpected, deploymentExpected])

    // Query all rules together (with merging)
    await expect(
      client.query(INDEXING_RULES_QUERY, { merged: true }).toPromise(),
    ).resolves.toHaveProperty('data.indexingRules', [
      globalExpected,
      deploymentMergedExpected,
    ])
  })

  test('Delete global rules (which should reset)', async () => {
    const globalInput = {
      identifier: INDEXING_RULE_GLOBAL,
      identifierType: SubgraphIdentifierType.GROUP,
      allocationAmount: '1',
      minSignal: '1',
      decisionBasis: IndexingDecisionBasis.NEVER,
      minAverageQueryFees: '1',
    }

    await client.mutation(SET_INDEXING_RULE_MUTATION, { rule: globalInput }).toPromise()

    await expect(
      client
        .mutation(DELETE_INDEXING_RULE_MUTATION, {
          identifier: 'global',
        })
        .toPromise(),
    ).resolves.toHaveProperty('data.deleteIndexingRule', true)

    await expect(
      client.query(INDEXING_RULES_QUERY, { merged: false }).toPromise(),
    ).resolves.toHaveProperty('data.indexingRules', [
      {
        ...defaults.globalIndexingRule,
        allocationAmount: defaults.globalIndexingRule.allocationAmount.toString(),
        custom: null,
        decisionBasis: 'rules',
        identifier: 'global',
        identifierType: SubgraphIdentifierType.GROUP,
        maxAllocationPercentage: null,
        maxSignal: null,
        minAverageQueryFees: null,
        minSignal: null,
        minStake: null,
      },
    ])
  })

  test('Delete multiple rules, including global (which should reset)', async () => {
    const globalInput = {
      identifier: INDEXING_RULE_GLOBAL,
      identifierType: SubgraphIdentifierType.GROUP,
      allocationAmount: '1',
      minSignal: '1',
      decisionBasis: IndexingDecisionBasis.NEVER,
      minAverageQueryFees: '1',
    }

    const deploymentInput = {
      identifier: '0xa4e311bfa7edabed7b31d93e0b3e751659669852ef46adbedd44dc2454db4bf3',
      identifierType: SubgraphIdentifierType.DEPLOYMENT,
      allocationAmount: '1',
      minSignal: '2',
    }

    await client.mutation(SET_INDEXING_RULE_MUTATION, { rule: globalInput }).toPromise()
    await client
      .mutation(SET_INDEXING_RULE_MUTATION, { rule: deploymentInput })
      .toPromise()

    await expect(
      client
        .mutation(DELETE_INDEXING_RULES_MUTATION, {
          identifiers: [
            'global',
            '0xa4e311bfa7edabed7b31d93e0b3e751659669852ef46adbedd44dc2454db4bf3',
          ],
        })
        .toPromise(),
    ).resolves.toHaveProperty('data.deleteIndexingRules', true)

    await expect(
      client.query(INDEXING_RULES_QUERY, { merged: false }).toPromise(),
    ).resolves.toHaveProperty('data.indexingRules', [
      {
        ...defaults.globalIndexingRule,
        allocationAmount: defaults.globalIndexingRule.allocationAmount.toString(),
        custom: null,
        decisionBasis: 'rules',
        identifier: 'global',
        identifierType: SubgraphIdentifierType.GROUP,
        maxAllocationPercentage: null,
        maxSignal: null,
        minAverageQueryFees: null,
        minSignal: null,
        minStake: null,
      },
    ])
  })
})
