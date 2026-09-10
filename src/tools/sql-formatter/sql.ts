/**
 * A thin wrapper around the `sql-formatter` package (v15).
 *
 * The interesting decision here is what *not* to build: `sql-formatter` has
 * no minify mode of its own, and hand-writing a SQL tokenizer just to strip
 * whitespace would mean maintaining a second, worse parser next to a real
 * one. Formatting first and then collapsing the pretty output's whitespace
 * reuses the same grammar for both jobs and gets validation "for free" on the
 * minify path too — an unparseable query fails exactly the same way in
 * either mode.
 *
 * The dialect list below is not guessed: it is every key of the real
 * `dialectNameMap` in `sql-formatter@15.8.2` (`node_modules/sql-formatter/
 * dist/esm/sqlFormatter.js`), minus the `tsql` entry, which is a pure alias
 * for `transactsql` and would just be a confusing duplicate in a dropdown.
 */
import { format, type KeywordCase } from 'sql-formatter'

export type { KeywordCase }

export type SqlDialect =
  | 'sql'
  | 'postgresql'
  | 'mysql'
  | 'mariadb'
  | 'sqlite'
  | 'transactsql'
  | 'plsql'
  | 'bigquery'
  | 'snowflake'
  | 'redshift'
  | 'spark'
  | 'trino'
  | 'hive'
  | 'db2'
  | 'db2i'
  | 'clickhouse'
  | 'duckdb'
  | 'n1ql'
  | 'tidb'
  | 'singlestoredb'

export const DIALECTS: ReadonlyArray<{ value: SqlDialect; label: string }> = [
  { value: 'sql', label: 'Standard SQL' },
  { value: 'postgresql', label: 'PostgreSQL' },
  { value: 'mysql', label: 'MySQL' },
  { value: 'mariadb', label: 'MariaDB' },
  { value: 'sqlite', label: 'SQLite' },
  { value: 'transactsql', label: 'T-SQL (SQL Server)' },
  { value: 'plsql', label: 'PL/SQL (Oracle)' },
  { value: 'bigquery', label: 'BigQuery' },
  { value: 'snowflake', label: 'Snowflake' },
  { value: 'redshift', label: 'Redshift' },
  { value: 'spark', label: 'Spark' },
  { value: 'trino', label: 'Trino' },
  { value: 'hive', label: 'Hive' },
  { value: 'db2', label: 'Db2' },
  { value: 'db2i', label: 'Db2 for i' },
  { value: 'clickhouse', label: 'ClickHouse' },
  { value: 'duckdb', label: 'DuckDB' },
  { value: 'n1ql', label: 'N1QL (Couchbase)' },
  { value: 'tidb', label: 'TiDB' },
  { value: 'singlestoredb', label: 'SingleStoreDB' },
]

/**
 * Narrows a raw `<select>` value (always a plain `string` to the DOM) into
 * `SqlDialect` by checking it against the real list, rather than trusting it
 * with a type assertion.
 */
export function isSqlDialect(value: string): value is SqlDialect {
  return DIALECTS.some((d) => d.value === value)
}

export interface SqlOptions {
  dialect: SqlDialect
  keywordCase: KeywordCase
  indentWidth: number
  linesBetweenQueries: number
  minify: boolean
}

export interface SqlSuccess {
  ok: true
  output: string
}

export interface SqlFailure {
  ok: false
  error: string
}

export type SqlResult = SqlSuccess | SqlFailure

export function formatSql(input: string, options: SqlOptions): SqlResult {
  if (input.trim() === '') return { ok: true, output: '' }

  try {
    const pretty = format(input, {
      language: options.dialect,
      keywordCase: options.keywordCase,
      tabWidth: options.indentWidth,
      linesBetweenQueries: options.linesBetweenQueries,
    })

    if (!options.minify) return { ok: true, output: pretty }
    return { ok: true, output: pretty.replace(/\s+/g, ' ').trim() }
  } catch (error) {
    return { ok: false, error: describeSqlError(error) }
  }
}

/**
 * `sql-formatter`'s parse errors lead with a one-line "Parse error at
 * token: ..." summary and then dump the entire nearley grammar state that
 * produced it — hundreds of lines naming rules nobody using this tool has
 * heard of. Only the headline is useful; the rest is truncated.
 */
function describeSqlError(error: unknown): string {
  if (error instanceof Error) {
    const headline = error.message.split('\n')[0]
    return headline !== undefined && headline !== '' ? headline : error.message
  }
  return 'Could not format this SQL — the parser could not make sense of the input.'
}
