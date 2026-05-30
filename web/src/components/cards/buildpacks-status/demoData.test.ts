import { describe, expect, it } from 'vitest'
import { BUILDPACKS_DEMO_DATA } from './demoData'

describe('BUILDPACKS_DEMO_DATA', () => {
  it('contains images with the required status-card fields', () => {
    expect(BUILDPACKS_DEMO_DATA.images.length).toBeGreaterThan(0)

    for (const image of BUILDPACKS_DEMO_DATA.images) {
      expect(image.name).toBeTruthy()
      expect(image.status).toBeTruthy()
      expect(image.namespace).toBeTruthy()
      expect(image.cluster).toBeTruthy()
      expect(image.image).toBeTruthy()
      expect(image.builder).toBeTruthy()
      expect(new Date(image.updated).toString()).not.toBe('Invalid Date')
    }
  })

  it('sets a valid lastCheckTime timestamp', () => {
    expect(new Date(BUILDPACKS_DEMO_DATA.lastCheckTime).toString()).not.toBe('Invalid Date')
  })
})
