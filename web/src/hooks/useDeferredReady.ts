import { useEffect, useState } from 'react'

/**
 * Returns `true` after a short delay (default 300ms) starting from mount.
 *
 * Used to defer non-critical queries so they don't compete with first-paint
 * critical requests (session, messages) on the same network queue.
 */
export function useDeferredReady(delay = 300): boolean {
    const [ready, setReady] = useState(false)
    useEffect(() => {
        const id = setTimeout(() => setReady(true), delay)
        return () => clearTimeout(id)
    }, [delay])
    return ready
}
