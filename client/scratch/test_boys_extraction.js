const { app } = require('electron')
const path = require('path')

app.disableHardwareAcceleration()

const distPath = path.join(__dirname, '../dist-electron')

app.whenReady().then(async () => {
  console.log('Electron is ready. Loading registry and extractor...')

  try {
    const registry = require(path.join(distPath, 'providers/registry.js'))
    const { extractStreamWithRetry } = require(path.join(distPath, 'stream-extractor/index.js'))

    const enabled = registry.getEnabledProviders()
    console.log(`Enabled providers (${enabled.length}):`, enabled.map(p => p.name).join(', '))

    const req = {
      title: 'The Boys',
      type: 'tv',
      season: 1,
      episode: 1,
      imdbId: 'tt1190634',
      tmdbId: 76479
    }

    console.log('\nStarting extraction test for:', req)

    for (const provider of enabled) {
      if (provider.id.includes('vidsrc') || provider.id.includes('vidlink')) {
        console.log(`[SKIP] ${provider.name}: Skipping to avoid headless SIGTRAP debugger crash`)
        continue
      }
      const embedUrl = provider.getEmbedUrl(req)
      if (!embedUrl) {
        console.log(`[SKIP] ${provider.name}: Cannot build embed URL`)
        continue
      }

      console.log(`\n[TRYING] ${provider.name} | URL: ${embedUrl}`)
      const start = Date.now()
      try {
        const result = await extractStreamWithRetry(embedUrl, {
          maxAttempts: 1,
          timeoutMs: 15000,
          sessionName: provider.sessionName
        })
        const duration = Date.now() - start
        if (result) {
          console.log(`[SUCCESS] ${provider.name} succeeded in ${duration}ms!`)
          console.log(`  Stream URL: ${result.url}`)
          console.log(`  Headers:`, JSON.stringify(result.headers))
        } else {
          console.log(`[FAIL] ${provider.name} returned no stream in ${duration}ms`)
        }
      } catch (err) {
        console.log(`[ERROR] ${provider.name} failed after ${Date.now() - start}ms:`, err)
      }
    }
  } catch (err) {
    console.error('Error in test script:', err)
  }

  console.log('\nTest extraction completed. Exiting...')
  app.exit(0)
})
