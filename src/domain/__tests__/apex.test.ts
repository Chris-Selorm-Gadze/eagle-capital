import { describe, it, expect } from 'vitest'
import { trailThreshold, roomToTrail } from '../apex'

describe('apex trail', () => {
  it('trails 6500 behind highest balance', () => {
    expect(trailThreshold(250_000, 'evaluation')).toBe(243_500)
    expect(trailThreshold(258_000, 'evaluation')).toBe(251_500)
  })
  it('rithmic eval trail caps at 265,000', () => {
    expect(trailThreshold(280_000, 'evaluation', 'rithmic')).toBe(265_000)
  })
  it('tradovate eval trail never caps', () => {
    expect(trailThreshold(280_000, 'evaluation', 'tradovate')).toBe(273_500)
  })
  it('PA trail caps at 250,100', () => {
    expect(trailThreshold(270_000, 'pa')).toBe(250_100)
  })
  it('room to trail uses highest, not current, balance', () => {
    // peaked at 258k unrealized, closed back at 252k -> only $500 of room left
    expect(roomToTrail(252_000, 258_000, 'evaluation')).toBe(500)
  })
})
