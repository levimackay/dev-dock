import { useEffect } from 'react'
import { Link } from 'react-router-dom'
import styles from './HomePage.module.css'
import { CATEGORIES, TOOLS, TOOL_BY_ID, toolsInCategory } from '@/tools/registry'
import { usePreferences } from './preferences'
import { Kbd } from '@/components/Kbd'
import { IconGlobe, IconKeyboard, IconShield, IconStar } from '@/components/Icon'
import { cx } from '@/lib/cx'

const NETWORK_TOOLS = TOOLS.filter((tool) => tool.network).length

export function HomePage() {
  const { pinned, recents, isPinned } = usePreferences()

  useEffect(() => {
    document.title = 'Dev Dock · developer utilities that stay in your browser'
  }, [])

  const quick = [...new Set([...pinned, ...recents])]
    .map((id) => TOOL_BY_ID.get(id))
    .filter((tool) => tool !== undefined)
    .slice(0, 8)

  return (
    <div className={styles.page}>
      <div className={styles.inner}>
        <header className={styles.masthead}>
          <h1 className={styles.lede}>
            Twenty-two tools.
            <br />
            <span className={styles.ledeDim}>Nothing leaves the tab.</span>
          </h1>
          <p className={styles.blurb}>
            The formatters, decoders, and converters you reach for a dozen times a day, in one
            keyboard-driven workbench. Everything runs <strong>locally in your browser</strong> —
            there is no server to send your tokens, payloads, or logs to.
          </p>
        </header>

        <div className={styles.metaRow}>
          <span>
            <b>{TOOLS.length}</b> tools
          </span>
          <span>
            <b>{CATEGORIES.length}</b> categories
          </span>
          <span>
            <b>{NETWORK_TOOLS}</b> makes network requests
          </span>
          <span>
            <b>0</b> accounts
          </span>
          <span>
            <b>0</b> trackers
          </span>
        </div>

        {quick.length > 0 && (
          <nav className={styles.strip} aria-label="Pinned and recent tools">
            <span className={styles.stripLabel}>Jump back in</span>
            {quick.map((tool) => (
              <Link key={tool.id} to={`/t/${tool.id}`} className={styles.chip}>
                {isPinned(tool.id) && <IconStar size={11} filled />}
                {tool.name}
              </Link>
            ))}
          </nav>
        )}

        {CATEGORIES.map((category) => {
          const tools = toolsInCategory(category.id)
          return (
            <section className={styles.category} key={category.id} aria-labelledby={`cat-${category.id}`}>
              <div className={styles.categoryHead}>
                <h2 className={styles.categoryName} id={`cat-${category.id}`}>
                  {category.label}
                </h2>
                <p className={styles.categoryBlurb}>{category.blurb}</p>
                <span className={styles.categoryCount}>{String(tools.length).padStart(2, '0')}</span>
              </div>
              <div className={styles.entries}>
                {tools.map((tool) => (
                  <Link to={`/t/${tool.id}`} className={styles.entry} key={tool.id}>
                    <span className={styles.entryName}>{tool.name}</span>
                    <span
                      className={cx(styles.entryMark, isPinned(tool.id) && styles.entryPinned)}
                      aria-hidden="true"
                    >
                      {isPinned(tool.id) ? <IconStar size={11} filled /> : '→'}
                    </span>
                    <span className={styles.entryDesc}>{tool.short}</span>
                  </Link>
                ))}
              </div>
            </section>
          )
        })}

        <footer className={styles.footnote}>
          <div className={styles.note}>
            <h3 className={styles.noteTitle}>
              <IconKeyboard size={12} />
              Built for the keyboard
            </h3>
            <p className={styles.noteBody}>
              <Kbd combo="mod+k" quiet /> opens the palette from anywhere,{' '}
              <Kbd combo="shift+/" quiet /> lists every binding, and{' '}
              <Kbd combo="mod+shift+s" quiet /> copies a link that restores whatever you have typed.
            </p>
          </div>
          <div className={styles.note}>
            <h3 className={styles.noteTitle}>
              <IconShield size={12} />
              Local by construction
            </h3>
            <p className={styles.noteBody}>
              Input is processed in the page and never transmitted. Share links carry their payload
              in the URL fragment, which browsers strip before a request is sent.
            </p>
          </div>
          <div className={styles.note}>
            <h3 className={styles.noteTitle}>
              <IconGlobe size={12} />
              One labelled exception
            </h3>
            <p className={styles.noteBody}>
              The HTTP Request Builder exists to make requests, so it does. It is the only tool that
              can, and it wears a <em>network</em> badge to say so.
            </p>
          </div>
        </footer>
      </div>
    </div>
  )
}
