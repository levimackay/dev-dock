import { Dialog } from '@/components/Dialog'
import { Kbd } from '@/components/Kbd'
import styles from './ShortcutsDialog.module.css'

const GROUPS: Array<{ title: string; items: Array<[string, string]> }> = [
  {
    title: 'Global',
    items: [
      ['mod+k', 'Open the command palette'],
      ['slash', 'Focus search'],
      ['mod+b', 'Show or hide the tool rail'],
      ['mod+shift+l', 'Cycle light, dark, and system themes'],
      ['shift+/', 'Open this shortcut list'],
      ['esc', 'Close any overlay'],
    ],
  },
  {
    title: 'In a tool',
    items: [
      ['mod+enter', 'Run the tool’s primary action'],
      ['mod+shift+c', 'Copy the tool’s output'],
      ['mod+shift+s', 'Copy a share link for the current input'],
      ['mod+shift+backspace', 'Clear the tool’s input'],
      ['mod+d', 'Pin or unpin the current tool'],
    ],
  },
  {
    title: 'Editors',
    items: [
      ['tab', 'Indent by two spaces'],
      ['shift+tab', 'Outdent by two spaces'],
    ],
  },
]

export function ShortcutsDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  return (
    <Dialog open={open} onClose={onClose} title="Keyboard shortcuts" width="30rem">
      <div className={styles.body}>
        {GROUPS.map((group) => (
          <section key={group.title} className={styles.group}>
            <h3 className={styles.groupTitle}>{group.title}</h3>
            <dl className={styles.list}>
              {group.items.map(([combo, label]) => (
                <div className={styles.row} key={combo}>
                  <dt className={styles.desc}>{label}</dt>
                  <dd className={styles.keys}>
                    <Kbd combo={combo} />
                  </dd>
                </div>
              ))}
            </dl>
          </section>
        ))}
      </div>
    </Dialog>
  )
}
