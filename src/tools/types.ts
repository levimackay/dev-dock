import type { ComponentType, LazyExoticComponent } from 'react'

export type ToolCategoryId = 'data' | 'encoding' | 'text' | 'time' | 'web' | 'generate'

export interface ToolCategory {
  id: ToolCategoryId
  label: string
  /** One line explaining what belongs here, shown on the index page. */
  blurb: string
}

export interface ToolMeta {
  /** URL slug. Stable forever — these end up in bookmarks and shared links. */
  id: string
  name: string
  /** Sentence-case tagline. Shown in the rail, palette, and index card. */
  short: string
  category: ToolCategoryId
  /**
   * Extra search terms. The name and tagline are already indexed, so this is
   * for the words people actually type instead of the official name:
   * "epoch" for the timestamp tool, "sha" for the hash tool.
   */
  keywords: string[]
  /**
   * True when the tool can make outbound network requests. Exactly one tool
   * does, and the UI marks it, because "nothing leaves your browser" is only
   * a credible promise if the exception is labelled.
   */
  network?: boolean
}

export interface ToolDefinition extends ToolMeta {
  Component: LazyExoticComponent<ComponentType>
}
