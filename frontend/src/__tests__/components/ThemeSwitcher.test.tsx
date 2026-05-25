import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { vi, describe, it, expect, beforeEach, afterEach } from 'vitest'
import { ThemeSwitcher } from '../../components/ThemeSwitcher'
import { useGameStore } from '../../store/gameStore'
import { resetStore } from '../../test/mockStore'

// Mock the api client so the store doesn't make real HTTP calls
vi.mock('../../api/client', () => ({
  api: {
    campaigns: { list: vi.fn(), create: vi.fn(), delete: vi.fn() },
    sessions: { list: vi.fn(), start: vi.fn(), end: vi.fn() },
    characters: { list: vi.fn(), create: vi.fn(), update: vi.fn(), delete: vi.fn() },
    tts: { providers: vi.fn(), synthesize: vi.fn() },
  },
}))

describe('ThemeSwitcher', () => {
  beforeEach(() => {
    resetStore()
    vi.clearAllMocks()
    // Clean up theme classes from body
    document.body.classList.remove('theme-fantasy', 'theme-hud', 'theme-minimal')
  })

  afterEach(() => {
    vi.clearAllMocks()
    document.body.classList.remove('theme-fantasy', 'theme-hud', 'theme-minimal')
  })

  // ── Rendering ────────────────────────────────────────────────────────────────

  describe('rendering', () => {
    it('renders three theme buttons: Fantasy, HUD, Minimal', () => {
      render(<ThemeSwitcher />)
      expect(screen.getByRole('button', { name: /fantasy/i })).toBeInTheDocument()
      expect(screen.getByRole('button', { name: /hud/i })).toBeInTheDocument()
      expect(screen.getByRole('button', { name: /minimal/i })).toBeInTheDocument()
    })

    it('Fantasy button has aria-pressed=true when default theme is fantasy', () => {
      // Default theme from resetStore is 'fantasy'
      render(<ThemeSwitcher />)
      const fantasyBtn = screen.getByRole('button', { name: /fantasy/i })
      expect(fantasyBtn).toHaveAttribute('aria-pressed', 'true')
    })

    it('HUD and Minimal buttons have aria-pressed=false when theme is fantasy', () => {
      render(<ThemeSwitcher />)
      const hudBtn = screen.getByRole('button', { name: /hud/i })
      const minimalBtn = screen.getByRole('button', { name: /minimal/i })
      expect(hudBtn).toHaveAttribute('aria-pressed', 'false')
      expect(minimalBtn).toHaveAttribute('aria-pressed', 'false')
    })

    it('each button has a title attribute describing the theme', () => {
      render(<ThemeSwitcher />)
      expect(screen.getByTitle('Switch to Fantasy theme')).toBeInTheDocument()
      expect(screen.getByTitle('Switch to HUD theme')).toBeInTheDocument()
      expect(screen.getByTitle('Switch to Minimal theme')).toBeInTheDocument()
    })
  })

  // ── Theme switching — body classes ────────────────────────────────────────

  describe('clicking buttons changes body class', () => {
    it('adds theme-hud and removes theme-fantasy when HUD is clicked', async () => {
      const user = userEvent.setup()
      document.body.classList.add('theme-fantasy')
      render(<ThemeSwitcher />)
      await user.click(screen.getByRole('button', { name: /hud/i }))
      expect(document.body.classList.contains('theme-hud')).toBe(true)
      expect(document.body.classList.contains('theme-fantasy')).toBe(false)
    })

    it('adds theme-minimal and removes other theme classes when Minimal is clicked', async () => {
      const user = userEvent.setup()
      document.body.classList.add('theme-fantasy')
      render(<ThemeSwitcher />)
      await user.click(screen.getByRole('button', { name: /minimal/i }))
      expect(document.body.classList.contains('theme-minimal')).toBe(true)
      expect(document.body.classList.contains('theme-fantasy')).toBe(false)
      expect(document.body.classList.contains('theme-hud')).toBe(false)
    })

    it('adds theme-fantasy when Fantasy is clicked', async () => {
      const user = userEvent.setup()
      document.body.classList.add('theme-hud')
      // Set initial theme to hud in store so we can then switch back
      useGameStore.setState({ settings: { ...useGameStore.getState().settings, theme: 'hud' } })
      render(<ThemeSwitcher />)
      await user.click(screen.getByRole('button', { name: /fantasy/i }))
      expect(document.body.classList.contains('theme-fantasy')).toBe(true)
      expect(document.body.classList.contains('theme-hud')).toBe(false)
    })
  })

  // ── Theme switching — store state ────────────────────────────────────────

  describe('clicking buttons updates store settings', () => {
    it('sets settings.theme to hud after clicking HUD', async () => {
      const user = userEvent.setup()
      render(<ThemeSwitcher />)
      await user.click(screen.getByRole('button', { name: /hud/i }))
      expect(useGameStore.getState().settings.theme).toBe('hud')
    })

    it('sets settings.theme to minimal after clicking Minimal', async () => {
      const user = userEvent.setup()
      render(<ThemeSwitcher />)
      await user.click(screen.getByRole('button', { name: /minimal/i }))
      expect(useGameStore.getState().settings.theme).toBe('minimal')
    })

    it('sets settings.theme to fantasy after clicking Fantasy', async () => {
      const user = userEvent.setup()
      useGameStore.setState({ settings: { ...useGameStore.getState().settings, theme: 'hud' } })
      render(<ThemeSwitcher />)
      await user.click(screen.getByRole('button', { name: /fantasy/i }))
      expect(useGameStore.getState().settings.theme).toBe('fantasy')
    })
  })

  // ── aria-pressed reflects current theme ───────────────────────────────────

  describe('aria-pressed updates after theme change', () => {
    it('HUD button becomes aria-pressed=true after clicking it', async () => {
      const user = userEvent.setup()
      render(<ThemeSwitcher />)
      await user.click(screen.getByRole('button', { name: /hud/i }))
      expect(screen.getByRole('button', { name: /hud/i })).toHaveAttribute('aria-pressed', 'true')
      expect(screen.getByRole('button', { name: /fantasy/i })).toHaveAttribute('aria-pressed', 'false')
    })
  })
})
