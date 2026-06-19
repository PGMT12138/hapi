import { describe, expect, it } from 'vitest'
import {
    resolvePendingSchedule,
    parsePreset,
    clampToMaxDays,
    validateSpecificDatetime,
} from './ScheduleTimePicker'

const MINUTE = 60 * 1000
const HOUR = 60 * MINUTE
const DAY = 24 * HOUR

describe('ScheduleTimePicker utils', () => {
    describe('resolvePendingSchedule', () => {
        it('resolves preset "+5m" relative to base timestamp', () => {
            const result = resolvePendingSchedule({ type: 'preset', preset: '+5m' })
            expect(result).toBeGreaterThan(Date.now() + 5 * MINUTE - 100)
            expect(result).toBeLessThan(Date.now() + 5 * MINUTE + 100)
        })

        it('resolves absolute ms value', () => {
            expect(resolvePendingSchedule({ type: 'absolute', ms: 1700000000000 })).toBe(1700000000000)
        })

        it('returns null for null input', () => {
            expect(resolvePendingSchedule(null)).toBeNull()
        })
    })

    describe('parsePreset', () => {
        it('parses "+5m"', () => {
            expect(parsePreset('+5m', 1000)).toBe(1000 + 5 * MINUTE)
        })

        it('parses "+30m"', () => {
            expect(parsePreset('+30m', 1000)).toBe(1000 + 30 * MINUTE)
        })

        it('parses "+1h"', () => {
            expect(parsePreset('+1h', 1000)).toBe(1000 + HOUR)
        })

        it('parses "+4h"', () => {
            expect(parsePreset('+4h', 1000)).toBe(1000 + 4 * HOUR)
        })

        it('throws for unknown preset', () => {
            expect(() => parsePreset('+99d', 1000)).toThrow()
        })
    })

    describe('clampToMaxDays', () => {
        it('keeps value unchanged when within range', () => {
            const now = Date.now()
            const within = now + 3 * DAY
            expect(clampToMaxDays(within, now, 7)).toBe(within)
        })

        it('clamps value beyond max days', () => {
            const now = Date.now()
            const beyond = now + 10 * DAY
            expect(clampToMaxDays(beyond, now, 7)).toBe(now + 7 * DAY)
        })
    })

    describe('validateSpecificDatetime', () => {
        it('returns "scheduleErrorPast" for time in the past', () => {
            expect(validateSpecificDatetime(Date.now() - 60 * 1000, Date.now())).toBe('scheduleErrorPast')
        })

        it('allows time within 30-second grace period', () => {
            expect(validateSpecificDatetime(Date.now() - 15 * 1000, Date.now())).toBeNull()
        })

        it('returns "scheduleErrorTooFar" for time beyond 7 days', () => {
            expect(validateSpecificDatetime(Date.now() + 8 * DAY, Date.now())).toBe('scheduleErrorTooFar')
        })

        it('returns null for valid future time', () => {
            expect(validateSpecificDatetime(Date.now() + 2 * HOUR, Date.now())).toBeNull()
        })
    })
})
