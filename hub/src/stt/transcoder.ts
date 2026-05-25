import type { Subprocess } from 'bun'

export class AudioTranscoder {
    private process: Subprocess<'pipe', 'pipe', 'pipe'> | null = null
    private onErrorCallback: ((error: Error) => void) | null = null
    private onEndCallback: (() => void) | null = null

    start(inputFormat: string): void {
        const args = [
            '-probesize', '512',
            '-analyzeduration', '0',
            '-fflags', '+nobuffer+fastseek',
            '-f', inputFormat,
            '-i', 'pipe:0',
            '-f', 's16le',
            '-ar', '16000',
            '-ac', '1',
            '-loglevel', 'error',
            'pipe:1',
        ]
        console.log(`[STT-Transcoder] Starting ffmpeg: ffmpeg ${args.join(' ')}`)
        this.process = Bun.spawn(['ffmpeg', ...args], {
            stdin: 'pipe',
            stdout: 'pipe',
            stderr: 'pipe',
        })
        console.log(`[STT-Transcoder] ffmpeg PID: ${this.process.pid}`)
        this.process.exited.then((code) => {
            if (code !== 0 && this.onErrorCallback) {
                this.onErrorCallback(new Error(`ffmpeg exited with code ${code}`))
            }
        })
    }

    write(chunk: Buffer): void {
        if (this.process?.stdin) {
            this.process.stdin.write(chunk)
        }
    }

    onData(callback: (data: Buffer) => void): void {
        if (this.process?.stdout) {
            console.log('[STT-Transcoder] Registering data reader on stdout')
            const reader = this.process.stdout.getReader()
            let chunksReceived = 0
            const readChunk = async (): Promise<void> => {
                while (true) {
                    const { done, value } = await reader.read()
                    if (done) {
                        console.log(`[STT-Transcoder] stdout done, total chunks: ${chunksReceived}`)
                        this.onEndCallback?.()
                        break
                    }
                    chunksReceived++
                    callback(Buffer.from(value))
                }
            }
            readChunk().catch((err) => {
                console.error('[STT-Transcoder] stdout reader error:', err)
            })
        }
    }

    end(): void {
        console.log('[STT-Transcoder] end() called, closing stdin')
        if (this.process?.stdin) {
            this.process.stdin.end()
        }
    }

    onError(callback: (error: Error) => void): void {
        this.onErrorCallback = callback
    }

    onEnd(callback: () => void): void {
        this.onEndCallback = callback
    }

    destroy(): void {
        if (this.process) {
            this.process.kill()
            this.process = null
        }
    }
}

export function detectInputFormat(mimeType: string): string {
    if (mimeType.includes('pcm') || mimeType.includes('s16le')) return 'pcm'
    if (mimeType.includes('webm')) return 'webm'
    if (mimeType.includes('mp4') || mimeType.includes('aac')) return 'mp4'
    if (mimeType.includes('ogg') || mimeType.includes('opus')) return 'ogg'
    if (mimeType.includes('wav')) return 'wav'
    return 'webm'
}
