import type { Subprocess } from 'bun'

export class AudioTranscoder {
    private process: Subprocess<'pipe', 'pipe', 'pipe'> | null = null
    private onErrorCallback: ((error: Error) => void) | null = null

    start(inputFormat: string): void {
        const args = [
            '-f', inputFormat,
            '-i', 'pipe:0',
            '-f', 's16le',
            '-ar', '16000',
            '-ac', '1',
            '-loglevel', 'error',
            'pipe:1',
        ]
        this.process = Bun.spawn(['ffmpeg', ...args], {
            stdin: 'pipe',
            stdout: 'pipe',
            stderr: 'pipe',
        })
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
            const reader = this.process.stdout.getReader()
            const readChunk = async (): Promise<void> => {
                while (true) {
                    const { done, value } = await reader.read()
                    if (done) break
                    callback(Buffer.from(value))
                }
            }
            readChunk().catch(() => {})
        }
    }

    end(): void {
        if (this.process?.stdin) {
            this.process.stdin.end()
        }
    }

    onError(callback: (error: Error) => void): void {
        this.onErrorCallback = callback
    }

    destroy(): void {
        if (this.process) {
            this.process.kill()
            this.process = null
        }
    }
}

export function detectInputFormat(mimeType: string): string {
    if (mimeType.includes('webm')) return 'webm'
    if (mimeType.includes('mp4') || mimeType.includes('aac')) return 'mp4'
    if (mimeType.includes('ogg') || mimeType.includes('opus')) return 'ogg'
    if (mimeType.includes('wav')) return 'wav'
    return 'webm'
}
