import { TOOLS, CATEGORY_BY_ID } from '@/tools/registry'
import { fuzzyScoreFields, type FuzzyResult } from '@/lib/fuzzy'

export interface Command {
  id: string
  name: string
  description: string
  /** Right-aligned group label, e.g. the tool's category. */
  tag: string
  section: 'Tools' | 'Actions'
  run: () => void
  keywords: string
}

export interface RankedCommand extends Command {
  match: FuzzyResult
}

/**
 * Ranks commands against a query.
 *
 * Fields are weighted so a hit on the visible name always beats a hit on
 * invisible keyword metadata — otherwise a user typing "hash" gets a result
 * whose title contains no "hash" anywhere, which reads as a bug.
 */
export function rankCommands(commands: Command[], query: string): RankedCommand[] {
  const trimmed = query.trim()
  if (!trimmed) {
    return commands.map((command) => ({ ...command, match: { score: 0, indices: [] } }))
  }

  const ranked: RankedCommand[] = []
  for (const command of commands) {
    const match = fuzzyScoreFields(
      [
        { text: command.name, weight: 1 },
        { text: command.description, weight: 0.4 },
        { text: command.keywords, weight: 0.55 },
      ],
      trimmed,
    )
    if (match) ranked.push({ ...command, match })
  }

  return ranked.sort((a, b) => b.match.score - a.match.score)
}

export function buildToolCommands(navigate: (path: string) => void): Command[] {
  return TOOLS.map((tool) => ({
    id: `tool:${tool.id}`,
    name: tool.name,
    description: tool.short,
    tag: CATEGORY_BY_ID.get(tool.category)?.label ?? '',
    section: 'Tools' as const,
    keywords: tool.keywords.join(' '),
    run: () => navigate(`/t/${tool.id}`),
  }))
}
