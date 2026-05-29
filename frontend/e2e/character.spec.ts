import { test, expect } from '@playwright/test'

test.beforeEach(async ({ page }) => {
  // Mock campaigns
  await page.route('**/api/campaigns', route => {
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify([
        {
          id: 1,
          name: 'Test Campaign',
          description: '',
          ruleset: 'dnd5e',
          access_code: 'code',
          session_count: 1,
          world_state: {},
          created_at: new Date().toISOString(),
        },
      ]),
    })
  })

  // Mock GET /api/1/characters
  await page.route('**/api/1/characters', route => {
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify([
        {
          id: 'char-1',
          campaign_id: '1',
          player_name: 'Alice',
          name: 'Thorin',
          race: 'Dwarf',
          class_name: 'Fighter',
          level: 3,
          hp_current: 28,
          hp_max: 34,
          stats: { STR: 16, DEX: 12, CON: 14, INT: 10, WIS: 12, CHA: 8 },
          inventory: [],
          conditions: [],
          notes: '',
          exhaustion: 0,
        },
      ]),
    })
  })

  // Mock GET /api/campaigns/1
  await page.route('**/api/campaigns/1', route => {
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        id: 1,
        name: 'Test Campaign',
        description: '',
        ruleset: 'dnd5e',
        access_code: 'code',
        session_count: 1,
        world_state: {},
        created_at: new Date().toISOString(),
        npcs: [],
        quests: [],
      }),
    })
  })
})

test('campaign list renders campaign name', async ({ page }) => {
  await page.goto('/')
  await expect(page.getByText('Test Campaign')).toBeVisible({ timeout: 5000 })
})
