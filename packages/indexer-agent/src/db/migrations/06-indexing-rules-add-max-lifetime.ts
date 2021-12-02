import { Logger } from '@graphprotocol/common-ts'
import { DataTypes, QueryInterface } from 'sequelize'

interface MigrationContext {
  queryInterface: QueryInterface
  logger: Logger
}

interface Context {
  context: MigrationContext
}

export async function up({ context }: Context): Promise<void> {
  const { queryInterface, logger } = context

  logger.debug(`Checking if indexing rules table exists`)
  const tables = await queryInterface.showAllTables()
  if (!tables.includes('IndexingRules')) {
    logger.info(`Indexing rules table does not exist, migration not necessary`)
    return
  }

  logger.debug(`Checking if 'IndexingRules' table needs to be migrated`)
  const table = await queryInterface.describeTable('IndexingRules')
  const allocationMaxLifetime = table.allocationMaxLifetime
  if (allocationMaxLifetime) {
    logger.info(
      `'allocationMaxLifetime' columns already exist, migration not necessary`,
    )
    return
  }

  logger.info(`Add 'allocationMaxLifetime' column to 'IndexingRules' table`)
  await queryInterface.addColumn('IndexingRules', 'allocationMaxLifetime', {
    type: DataTypes.INTEGER,
    allowNull: true,
  })
}

export async function down({ context }: Context): Promise<void> {
  const { queryInterface, logger } = context

  return await queryInterface.sequelize.transaction({}, async transaction => {
    const tables = await queryInterface.showAllTables()

    if (tables.includes('IndexingRules')) {
      logger.info(`Remove 'allocationMaxLifetime' column`)
      await context.queryInterface.removeColumn(
        'IndexingRules',
        'allocationMaxLifetime',
        { transaction },
      )

      logger.info(
        `Remove 'int_IndexingRules_allocationMaxLifetime' custom type`,
      )
      await queryInterface.sequelize.query(
        `delete  from pg_type where typname = 'int_IndexingRules_allocationMaxLifetime'`,
      )
    }
  })
}
