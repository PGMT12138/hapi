import { io, type Socket } from 'socket.io-client'
import type { SttClientEvents, SttServerEvents } from '@hapi/protocol/stt'

type SttSocketInstance = Socket<SttServerEvents, SttClientEvents>

let sttSocket: SttSocketInstance | null = null

export function getSttSocket(serverUrl: string, token: string): SttSocketInstance {
    if (sttSocket?.connected) return sttSocket

    sttSocket = io(`${serverUrl}/stt`, {
        auth: { token },
        transports: ['websocket'],
        reconnection: false,
    })

    return sttSocket
}

export function disconnectSttSocket(): void {
    if (sttSocket) {
        sttSocket.disconnect()
        sttSocket = null
    }
}
