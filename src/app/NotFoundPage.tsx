import { Link } from 'react-router-dom'
import { EmptyState } from '@/components/EmptyState'
import { IconSearch } from '@/components/Icon'
import { TOOLS } from '@/tools/registry'
import { fuzzyScoreFields } from '@/lib/fuzzy'

/**
 * A 404 that does some work: it fuzzy-matches whatever was in the URL against
 * the registry, so a mistyped or renamed slug lands on a suggestion instead of
 * a dead end.
 */
export function NotFoundPage({ missing }: { missing?: string }) {
  const query = (missing ?? '').replace(/[-_]/g, ' ')
  const suggestions = query
    ? TOOLS.map((tool) => ({
        tool,
        match: fuzzyScoreFields(
          [
            { text: tool.name, weight: 1 },
            { text: tool.keywords.join(' '), weight: 0.5 },
          ],
          query,
        ),
      }))
        .filter((entry) => entry.match)
        .sort((a, b) => b.match!.score - a.match!.score)
        .slice(0, 3)
    : []

  return (
    <EmptyState
      title={missing ? `No tool called “${missing}”` : 'Page not found'}
      mark={<IconSearch size={28} />}
      actions={
        <>
          {suggestions.map(({ tool }) => (
            <Link key={tool.id} to={`/t/${tool.id}`}>
              {tool.name}
            </Link>
          ))}
          <Link to="/">All tools</Link>
        </>
      }
    >
      {suggestions.length > 0
        ? 'That slug does not match a tool. These are the closest ones.'
        : 'Press ⌘K to search everything Dev Dock can do.'}
    </EmptyState>
  )
}
