import { io, type Socket } from 'socket.io-client'
import type { SttClientEvents, SttServerEvents } from '@hapi/protocol/stt'

type SttSocketInstance = Socket<SttServerEvents, SttClientEvents>

let sttSocket: SttSocketInstance | null = null

export function getSttSocket(serverUrl: string, token: string): SttSocketInstance {
    // Always clean up old socket if it exists
    if (sttSocket) {
        sttSocket.removeAllListeners()
        sttSocket.disconnect()
        sttSocket = null
    }

    sttSocket = io(`${serverUrl}/stt`, {
        auth: { token },
        transports: ['websocket'],
        reconnection: false,
        autoConnect: false,
    })

    return sttSocket
}

export function disconnectSttSocket(): void {
    if (sttSocket) {
        sttSocket.removeAllListeners()
        sttSocket.disconnect()
        sttSocket = null
    }
}
