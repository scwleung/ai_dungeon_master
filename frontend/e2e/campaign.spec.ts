import { test, expect } from '@playwright/test'

// Mock API responses so tests don't need a live backend
test.beforeEach(async ({ page }) => {
  // Mock GET /api/campaigns
  await page.route('**/api/campaigns', route => {
    if (route.request().method() === 'GET') {
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify([
          {
            id: 1,
            name: 'Test Campaign',
            description: 'A test campaign',
            ruleset: 'dnd5e',
            access_code: 'test-code',
            session_count: 0,
            world_state: {},
            created_at: new Date().toISOString(),
          },
        ]),
      })
    } else {
      route.continue()
    }
  })

  // Mock POST /api/campaigns
  await page.route('**/api/campaigns', route => {
    if (route.request().method() === 'POST') {
      route.fulfill({
        status: 201,
        contentType: 'application/json',
        body: JSON.stringify({
          id: 2,
          name: 'New Campaign',
          description: '',
          ruleset: 'dnd5e',
          access_code: 'new-code',
          session_count: 0,
          world_state: {},
          created_at: new Date().toISOString(),
        }),
      })
    } else {
      route.continue()
    }
  })
})

test('shows campaign list on load', async ({ page }) => {
  await page.goto('/')
  await expect(page.getByText('Test Campaign')).toBeVisible({ timeout: 5000 })
})

test('shows create campaign button', async ({ page }) => {
  await page.goto('/')
  const createBtn = page.getByRole('button', { name: /new campaign|create/i })
  await expect(createBtn).toBeVisible({ timeout: 5000 })
})

test('has correct page title', async ({ page }) => {
  await page.goto('/')
  await expect(page).toHaveTitle(/dungeon master|ai dm/i)
})
