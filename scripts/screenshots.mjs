// Магазинные скриншоты через Playwright → publish/screenshots/<lang>/<layout>/*.png.
// Мобильные 1080×1920 (портрет) и десктопные 1920×1080 (ландшафт), языки ru+en.
// Использует УЖЕ ЗАПУЩЕННЫЙ dev-сервер (:5173).
//   node scripts/screenshots.mjs                → всё (2 языка × 2 лэйаута)
//   SHOT_LANG=en SHOT_LAYOUT=desktop node scripts/screenshots.mjs
// Игра открывается с ?debug — main.js публикует window.__ttd для управления сценами.
import { chromium } from 'playwright'
import { homedir } from 'node:os'
import { existsSync, mkdirSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const BASE = process.env.URL || 'http://localhost:5173/'
const LANGS = process.env.SHOT_LANG ? [process.env.SHOT_LANG] : ['ru', 'en']
const LAYOUTS = process.env.SHOT_LAYOUT
  ? [process.env.SHOT_LAYOUT]
  : ['mobile', 'desktop']
const VIEWPORTS = {
  mobile: { width: 540, height: 960 },   // ×2 = 1080×1920
  desktop: { width: 960, height: 540 },  // ×2 = 1920×1080
}

const CACHE = join(homedir(), 'Library/Caches/ms-playwright')
const CANDIDATES = [
  join(CACHE, 'chromium-1223/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing'),
  join(CACHE, 'chromium_headless_shell-1223/chrome-headless-shell-mac-arm64/chrome-headless-shell'),
]
const executablePath = CANDIDATES.find((p) => existsSync(p))

const browser = await chromium.launch({
  executablePath,
  args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--mute-audio'],
})

for (const lang of LANGS) {
for (const layout of LAYOUTS) {
  const OUT = join(ROOT, 'publish/screenshots', lang, layout)
  mkdirSync(OUT, { recursive: true })
  const page = await browser.newPage({ viewport: VIEWPORTS[layout], deviceScaleFactor: 2 })
  await page.goto(`${BASE}?lang=${lang}&debug=1`, { waitUntil: 'load' })
  await page.waitForFunction(() => window.__ttd, { timeout: 30000 })
  await page.waitForTimeout(1500)

  const shot = (name) => page.screenshot({ path: join(OUT, `${name}.png`) })
  const toMenu = async () => { await page.evaluate(() => window.__ttd.goMenu(false)); await page.waitForTimeout(700) }

  // 0) меню с логотипом и рангом
  await page.evaluate(() => {
    localStorage.removeItem('turbo-traffic-3d-save')
    document.getElementById('tutorial-hint').classList.remove('show')
    document.getElementById('menu-toast').classList.remove('show')
  })
  await shot('00_menu')

  // 1) классика днём: неуязвимость на время скрина, накат ~6с — трафик, счёт, скорость
  await page.evaluate(() => {
    const { game, startRun } = window.__ttd
    startRun('classic')
    game.state.cfg = { ...game.state.cfg, invuln: true } // не разбиться, пока ждём кадр
    game.world._setTod(0.78) // день
    document.getElementById('tutorial-hint').classList.remove('show')
  })
  await page.waitForTimeout(6000)
  await page.evaluate(() => {
    window.__ttd.game.world._setTod(0.8)
    // Комбо-каунтер в кадре — как выглядит серия обгонов
    const combo = document.getElementById('hud-combo')
    combo.textContent = 'x4'
    combo.classList.add('on')
  })
  await shot('01_race')
  await page.evaluate(() => document.getElementById('hud-combo').classList.remove('on'))

  // 2) нитро на закате: полная шкала → активация → пламя и виньетка
  await page.evaluate(() => {
    const { game } = window.__ttd
    game.world._setTod(0.97) // закат
    game.state.nitro = 100
    game.nitro()
  })
  await page.waitForTimeout(900)
  await shot('02_nitro')

  // 3) разгром дождливой ночью: тараны с фейерверком частиц (рулим в трафик)
  await page.evaluate(() => {
    window.__ttd.startRun('rampage')
    window.__ttd.game.world._setTod(0.25) // ночь, звёзды, фары
    window.__ttd.game.world.setRain(true)
  })
  await page.waitForTimeout(3500)
  for (let i = 0; i < 9; i++) {
    await page.evaluate((dir) => window.__ttd.game.steer(dir), i % 2 ? 1 : -1)
    await page.waitForTimeout(550)
  }
  await shot('03_rampage')

  // 4) гараж
  await toMenu()
  await page.click('#btn-garage')
  await page.waitForTimeout(900)
  await shot('04_garage')
  await page.click('#btn-garage-back')

  // 5) задания
  await page.waitForTimeout(400)
  await page.click('#btn-missions')
  await page.waitForTimeout(600)
  await shot('05_missions')
  await page.click('#btn-missions-back')

  // 6) награды: сеем тоталы фейковым заездом — часть достижений закрыта, часть в прогрессе
  await page.waitForTimeout(400)
  await page.evaluate(() => {
    window.__ttd.gameOver({
      score: 5400, coins: 210, canRevive: false, reason: 'crash',
      stats: { dist: 6400, coins: 210, near: 27, oncoming: 6, overtakes: 41, cones: 18, nitroUses: 9, rams: 12, time: 121, bestCombo: 7, ufo: false },
    })
  })
  await page.waitForTimeout(400)
  await page.click('#btn-gameover-menu')
  await page.waitForTimeout(700)
  await page.click('#btn-achievements')
  await page.waitForTimeout(600)
  await shot('06_achievements')
  await page.click('#btn-ach-back')

  // 7) экран результата: новый рекорд, конфетти, статы заезда
  await page.waitForTimeout(400)
  await page.evaluate(() => {
    window.__ttd.gameOver({
      score: 12480, coins: 57, canRevive: true, reason: 'crash',
      stats: { dist: 4200, coins: 57, near: 11, oncoming: 3, overtakes: 34, cones: 5, nitroUses: 3, rams: 0, time: 96, bestCombo: 6, ufo: false },
    })
  })
  await page.waitForTimeout(900)
  await page.evaluate(() => document.getElementById('menu-toast').classList.remove('show'))
  await shot('07_gameover')

  await page.close()
  const size = layout === 'mobile' ? '1080×1920' : '1920×1080'
  console.log(`✓ ${lang}/${layout}: скриншоты в publish/screenshots/${lang}/${layout}/ (${size})`)
}
}

await browser.close()
