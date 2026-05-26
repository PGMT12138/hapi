import { useState, useRef, useEffect } from 'react'
import { useTranslation } from '@/lib/use-translation'
import { useAppGoBack } from '@/hooks/useAppGoBack'
import { getElevenLabsSupportedLanguages, getLanguageDisplayName, type Language } from '@/lib/languages'
import { useSttConfig } from '@/hooks/queries/useSttConfig'
import { useSttConfigActions } from '@/hooks/mutations/useSttConfigActions'
import { STT_DEFAULT_REGION } from '@hapi/protocol/stt'
import { useAppContext } from '@/lib/app-context'

const voiceLanguages = getElevenLabsSupportedLanguages()

const sttProviderOptions: { value: string; label: string }[] = [
    { value: 'tencent', label: '腾讯云' },
    { value: 'xunfei', label: '讯飞' },
]

const sttLanguageOptions: { value: string; label: string }[] = [
    { value: 'auto', label: '自动检测' },
    { value: 'zh', label: '中文' },
    { value: 'en', label: '英文' },
]

function BackIcon() {
    return (
        <svg
            xmlns="http://www.w3.org/2000/svg"
            width="20"
            height="20"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
        >
            <polyline points="15 18 9 12 15 6" />
        </svg>
    )
}

function CheckIcon() {
    return (
        <svg
            xmlns="http://www.w3.org/2000/svg"
            width="18"
            height="18"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2.5"
            strokeLinecap="round"
            strokeLinejoin="round"
        >
            <polyline points="20 6 9 17 4 12" />
        </svg>
    )
}

function ChevronDownIcon(props: { className?: string }) {
    return (
        <svg
            xmlns="http://www.w3.org/2000/svg"
            width="16"
            height="16"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            className={props.className}
        >
            <polyline points="6 9 12 15 18 9" />
        </svg>
    )
}

export default function VoiceSettingsPage() {
    const { t } = useTranslation()
    const goBack = useAppGoBack()

    // Voice language
    const [voiceLanguage, setVoiceLanguage] = useState<string | null>(() => {
        return localStorage.getItem('hapi-voice-lang')
    })
    const [isVoiceOpen, setIsVoiceOpen] = useState(false)
    const voiceContainerRef = useRef<HTMLDivElement>(null)

    // STT config
    const { api: sttApi } = useAppContext()
    const { configs, activeConfig } = useSttConfig(sttApi)
    const { updateConfig, setActive } = useSttConfigActions(sttApi)
    const [isSttProviderOpen, setIsSttProviderOpen] = useState(false)
    const [isSttLanguageOpen, setIsSttLanguageOpen] = useState(false)
    const [sttProvider, setSttProvider] = useState(activeConfig?.provider ?? 'tencent')
    const [sttAppId, setSttAppId] = useState('')
    const [sttSecretId, setSttSecretId] = useState('')
    const [sttSecretKey, setSttSecretKey] = useState('')
    const [sttLanguage, setSttLanguage] = useState(activeConfig?.language ?? 'zh')
    const [showSecretKey, setShowSecretKey] = useState(false)
    // 讯飞配置字段（独立于腾讯云）
    const [sttAppId_XF, setSttAppId_XF] = useState('')
    const [sttApiKey, setSttApiKey] = useState('')
    const [sttApiSecret, setSttApiSecret] = useState('')
    const [showApiKey, setShowApiKey] = useState(false)
    const [showApiSecret, setShowApiSecret] = useState(false)
    const [sttSaving, setSttSaving] = useState(false)
    const [sttActivating, setSttActivating] = useState(false)
    const sttProviderContainerRef = useRef<HTMLDivElement>(null)
    const sttLanguageContainerRef = useRef<HTMLDivElement>(null)

    useEffect(() => {
        const tencentConfig = configs.find(c => c.provider === 'tencent')
        const xunfeiConfig = configs.find(c => c.provider === 'xunfei')
        const activeConfig = configs.find(c => c.active === 1)

        if (activeConfig) {
            setSttProvider(activeConfig.provider)
            setSttLanguage(activeConfig.language)
        }
        if (tencentConfig) {
            setSttAppId(tencentConfig.appId)
            setSttSecretId(tencentConfig.secretId)
            setSttSecretKey(tencentConfig.secretKey)
        }
        if (xunfeiConfig) {
            setSttAppId_XF(xunfeiConfig.appId)
            setSttApiKey(xunfeiConfig.apiKey)
            setSttApiSecret(xunfeiConfig.apiSecret)
        }
    }, [configs])

    const currentVoiceLanguage = voiceLanguages.find((lang) => lang.code === voiceLanguage)

    const handleVoiceLanguageChange = (language: Language) => {
        setVoiceLanguage(language.code)
        if (language.code === null) {
            localStorage.removeItem('hapi-voice-lang')
        } else {
            localStorage.setItem('hapi-voice-lang', language.code)
        }
        setIsVoiceOpen(false)
    }

    // Close dropdown when clicking outside
    useEffect(() => {
        if (!isVoiceOpen && !isSttProviderOpen && !isSttLanguageOpen) return

        const handleClickOutside = (event: MouseEvent) => {
            if (isVoiceOpen && voiceContainerRef.current && !voiceContainerRef.current.contains(event.target as Node)) {
                setIsVoiceOpen(false)
            }
            if (isSttProviderOpen && sttProviderContainerRef.current && !sttProviderContainerRef.current.contains(event.target as Node)) {
                setIsSttProviderOpen(false)
            }
            if (isSttLanguageOpen && sttLanguageContainerRef.current && !sttLanguageContainerRef.current.contains(event.target as Node)) {
                setIsSttLanguageOpen(false)
            }
        }

        document.addEventListener('mousedown', handleClickOutside)
        return () => document.removeEventListener('mousedown', handleClickOutside)
    }, [isVoiceOpen, isSttProviderOpen, isSttLanguageOpen])

    useEffect(() => {
        if (!isVoiceOpen && !isSttProviderOpen && !isSttLanguageOpen) return

        const handleEscape = (event: KeyboardEvent) => {
            if (event.key === 'Escape') {
                setIsVoiceOpen(false)
                setIsSttProviderOpen(false)
                setIsSttLanguageOpen(false)
            }
        }

        document.addEventListener('keydown', handleEscape)
        return () => document.removeEventListener('keydown', handleEscape)
    }, [isVoiceOpen, isSttProviderOpen, isSttLanguageOpen])

    return (
        <div className="flex h-full min-h-0 flex-col">
            <div className="bg-[var(--app-bg)] pt-[env(safe-area-inset-top)]">
                <div className="mx-auto w-full max-w-content flex items-center gap-2 p-3 border-b border-[var(--app-border)]">
                    <button
                        type="button"
                        onClick={goBack}
                        className="flex h-8 w-8 items-center justify-center rounded-full text-[var(--app-hint)] transition-colors hover:bg-[var(--app-secondary-bg)] hover:text-[var(--app-fg)]"
                    >
                        <BackIcon />
                    </button>
                    <div className="flex-1 font-semibold">语音配置</div>
                </div>
            </div>

            <div className="app-scroll-y flex-1 min-h-0">
                <div className="mx-auto w-full max-w-content">
                    {/* Voice Assistant section */}
                    <div className="border-b border-[var(--app-divider)]">
                        <div className="px-3 py-2 text-xs font-semibold text-[var(--app-hint)] uppercase tracking-wide">
                            {t('settings.voice.title')}
                        </div>
                        <div ref={voiceContainerRef} className="relative">
                            <button
                                type="button"
                                onClick={() => setIsVoiceOpen(!isVoiceOpen)}
                                className="flex w-full items-center justify-between px-3 py-3 text-left transition-colors hover:bg-[var(--app-subtle-bg)]"
                                aria-expanded={isVoiceOpen}
                                aria-haspopup="listbox"
                            >
                                <span className="text-[var(--app-fg)]">{t('settings.voice.language')}</span>
                                <span className="flex items-center gap-1 text-[var(--app-hint)]">
                                    <span>
                                        {currentVoiceLanguage
                                            ? currentVoiceLanguage.code === null
                                                ? t('settings.voice.autoDetect')
                                                : getLanguageDisplayName(currentVoiceLanguage)
                                            : t('settings.voice.autoDetect')}
                                    </span>
                                    <ChevronDownIcon className={`transition-transform ${isVoiceOpen ? 'rotate-180' : ''}`} />
                                </span>
                            </button>

                            {isVoiceOpen && (
                                <div
                                    className="absolute right-3 top-full mt-1 min-w-[200px] max-h-[300px] overflow-y-auto rounded-lg border border-[var(--app-border)] bg-[var(--app-bg)] shadow-lg z-50"
                                    role="listbox"
                                    aria-label={t('settings.voice.title')}
                                >
                                    {voiceLanguages.map((lang) => {
                                        const isSelected = voiceLanguage === lang.code
                                        const displayName = lang.code === null
                                            ? t('settings.voice.autoDetect')
                                            : getLanguageDisplayName(lang)
                                        return (
                                            <button
                                                key={lang.code ?? 'auto'}
                                                type="button"
                                                role="option"
                                                aria-selected={isSelected}
                                                onClick={() => handleVoiceLanguageChange(lang)}
                                                className={`flex items-center justify-between w-full px-3 py-2 text-base text-left transition-colors ${
                                                    isSelected
                                                        ? 'text-[var(--app-link)] bg-[var(--app-subtle-bg)]'
                                                        : 'text-[var(--app-fg)] hover:bg-[var(--app-subtle-bg)]'
                                                }`}
                                            >
                                                <span>{displayName}</span>
                                                {isSelected && (
                                                    <span className="ml-2 text-[var(--app-link)]">
                                                        <CheckIcon />
                                                    </span>
                                                )}
                                            </button>
                                        )
                                    })}
                                </div>
                            )}
                        </div>
                    </div>

                    {/* Speech Input (STT) section */}
                    <div className="border-b border-[var(--app-divider)]">
                        <div className="px-3 py-2 text-xs font-semibold text-[var(--app-hint)] uppercase tracking-wide">
                            语音输入
                        </div>
                        <div ref={sttProviderContainerRef} className="relative">
                            <button
                                type="button"
                                onClick={() => setIsSttProviderOpen(!isSttProviderOpen)}
                                className="flex w-full items-center justify-between px-3 py-3 text-left transition-colors hover:bg-[var(--app-subtle-bg)]"
                                aria-expanded={isSttProviderOpen}
                                aria-haspopup="listbox"
                            >
                                <span className="text-[var(--app-fg)]">服务商</span>
                                <span className="flex items-center gap-1 text-[var(--app-hint)]">
                                    <span>{sttProviderOptions.find(o => o.value === sttProvider)?.label ?? '腾讯云'}</span>
                                    <ChevronDownIcon className={`transition-transform ${isSttProviderOpen ? 'rotate-180' : ''}`} />
                                </span>
                            </button>

                            {isSttProviderOpen && (
                                <div
                                    className="absolute right-3 top-full mt-1 min-w-[160px] rounded-lg border border-[var(--app-border)] bg-[var(--app-bg)] shadow-lg overflow-hidden z-50"
                                    role="listbox"
                                    aria-label="服务商"
                                >
                                    {sttProviderOptions.map((opt) => {
                                        const isSelected = sttProvider === opt.value
                                        return (
                                            <button
                                                key={opt.value}
                                                type="button"
                                                role="option"
                                                aria-selected={isSelected}
                                                onClick={() => {
                                                    setSttProvider(opt.value)
                                                    setIsSttProviderOpen(false)
                                                }}
                                                className={`flex items-center justify-between w-full px-3 py-2 text-base text-left transition-colors ${
                                                    isSelected
                                                        ? 'text-[var(--app-link)] bg-[var(--app-subtle-bg)]'
                                                        : 'text-[var(--app-fg)] hover:bg-[var(--app-subtle-bg)]'
                                                }`}
                                            >
                                                <span>{opt.label}</span>
                                                {isSelected && (
                                                    <span className="ml-2 text-[var(--app-link)]">
                                                        <CheckIcon />
                                                    </span>
                                                )}
                                            </button>
                                        )
                                    })}
                                </div>
                            )}
                        </div>
                        <div className="px-3 py-2">
                            <div className="mb-1 text-sm text-[var(--app-fg)]">AppID</div>
                            <input
                                type="text"
                                value={sttProvider === 'tencent' ? sttAppId : sttAppId_XF}
                                onChange={(e) => {
                                    if (sttProvider === 'tencent') {
                                        setSttAppId(e.target.value)
                                    } else {
                                        setSttAppId_XF(e.target.value)
                                    }
                                }}
                                placeholder="输入 AppID"
                                className="w-full rounded-lg border border-[var(--app-border)] bg-[var(--app-bg)] px-3 py-2 text-sm text-[var(--app-fg)] placeholder-[var(--app-hint)] focus:outline-none focus:border-[var(--app-link)]"
                            />
                        </div>
                        {sttProvider === 'tencent' && (
                            <div className="px-3 py-2">
                                <div className="mb-1 text-sm text-[var(--app-fg)]">SecretId</div>
                                <input
                                    type="text"
                                    value={sttSecretId}
                                    onChange={(e) => setSttSecretId(e.target.value)}
                                    placeholder="输入 SecretId"
                                    className="w-full rounded-lg border border-[var(--app-border)] bg-[var(--app-bg)] px-3 py-2 text-sm text-[var(--app-fg)] placeholder-[var(--app-hint)] focus:outline-none focus:border-[var(--app-link)]"
                                />
                            </div>
                        )}
                        {sttProvider === 'tencent' && (
                            <div className="px-3 py-2">
                                <div className="mb-1 text-sm text-[var(--app-fg)]">SecretKey</div>
                                <div className="relative">
                                    <input
                                        type={showSecretKey ? 'text' : 'password'}
                                        value={sttSecretKey}
                                        onChange={(e) => setSttSecretKey(e.target.value)}
                                        placeholder="输入 SecretKey"
                                        className="w-full rounded-lg border border-[var(--app-border)] bg-[var(--app-bg)] px-3 py-2 pr-10 text-sm text-[var(--app-fg)] placeholder-[var(--app-hint)] focus:outline-none focus:border-[var(--app-link)]"
                                    />
                                    <button
                                        type="button"
                                        onClick={() => setShowSecretKey(!showSecretKey)}
                                        className="absolute right-2 top-1/2 -translate-y-1/2 flex h-6 w-6 items-center justify-center rounded text-[var(--app-hint)] hover:text-[var(--app-fg)]"
                                        aria-label={showSecretKey ? '隐藏' : '显示'}
                                    >
                                        {showSecretKey ? (
                                            <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                                <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94" />
                                                <path d="M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19" />
                                                <line x1="1" y1="1" x2="23" y2="23" />
                                            </svg>
                                        ) : (
                                            <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                                <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
                                                <circle cx="12" cy="12" r="3" />
                                            </svg>
                                        )}
                                    </button>
                                </div>
                            </div>
                        )}
                        {sttProvider === 'xunfei' && (
                            <div className="px-3 py-2">
                                <div className="mb-1 text-sm text-[var(--app-fg)]">APIKey</div>
                                <div className="relative">
                                    <input
                                        type={showApiKey ? 'text' : 'password'}
                                        value={sttApiKey}
                                        onChange={(e) => setSttApiKey(e.target.value)}
                                        placeholder="输入 APIKey"
                                        className="w-full rounded-lg border border-[var(--app-border)] bg-[var(--app-bg)] px-3 py-2 pr-10 text-sm text-[var(--app-fg)] placeholder-[var(--app-hint)] focus:outline-none focus:border-[var(--app-link)]"
                                    />
                                    <button
                                        type="button"
                                        onClick={() => setShowApiKey(!showApiKey)}
                                        className="absolute right-2 top-1/2 -translate-y-1/2 flex h-6 w-6 items-center justify-center rounded text-[var(--app-hint)] hover:text-[var(--app-fg)]"
                                        aria-label={showApiKey ? '隐藏' : '显示'}
                                    >
                                        {showApiKey ? (
                                            <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                                <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94" />
                                                <path d="M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19" />
                                                <line x1="1" y1="1" x2="23" y2="23" />
                                            </svg>
                                        ) : (
                                            <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                                <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
                                                <circle cx="12" cy="12" r="3" />
                                            </svg>
                                        )}
                                    </button>
                                </div>
                            </div>
                        )}
                        {sttProvider === 'xunfei' && (
                            <div className="px-3 py-2">
                                <div className="mb-1 text-sm text-[var(--app-fg)]">APISecret</div>
                                <div className="relative">
                                    <input
                                        type={showApiSecret ? 'text' : 'password'}
                                        value={sttApiSecret}
                                        onChange={(e) => setSttApiSecret(e.target.value)}
                                        placeholder="输入 APISecret"
                                        className="w-full rounded-lg border border-[var(--app-border)] bg-[var(--app-bg)] px-3 py-2 pr-10 text-sm text-[var(--app-fg)] placeholder-[var(--app-hint)] focus:outline-none focus:border-[var(--app-link)]"
                                    />
                                    <button
                                        type="button"
                                        onClick={() => setShowApiSecret(!showApiSecret)}
                                        className="absolute right-2 top-1/2 -translate-y-1/2 flex h-6 w-6 items-center justify-center rounded text-[var(--app-hint)] hover:text-[var(--app-fg)]"
                                        aria-label={showApiSecret ? '隐藏' : '显示'}
                                    >
                                        {showApiSecret ? (
                                            <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                                <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94" />
                                                <path d="M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19" />
                                                <line x1="1" y1="1" x2="23" y2="23" />
                                            </svg>
                                        ) : (
                                            <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                                <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
                                                <circle cx="12" cy="12" r="3" />
                                            </svg>
                                        )}
                                    </button>
                                </div>
                            </div>
                        )}
                        <div ref={sttLanguageContainerRef} className="relative">
                            <button
                                type="button"
                                onClick={() => setIsSttLanguageOpen(!isSttLanguageOpen)}
                                className="flex w-full items-center justify-between px-3 py-3 text-left transition-colors hover:bg-[var(--app-subtle-bg)]"
                                aria-expanded={isSttLanguageOpen}
                                aria-haspopup="listbox"
                            >
                                <span className="text-[var(--app-fg)]">语言</span>
                                <span className="flex items-center gap-1 text-[var(--app-hint)]">
                                    <span>{sttLanguageOptions.find(o => o.value === sttLanguage)?.label ?? '中文'}</span>
                                    <ChevronDownIcon className={`transition-transform ${isSttLanguageOpen ? 'rotate-180' : ''}`} />
                                </span>
                            </button>

                            {isSttLanguageOpen && (
                                <div
                                    className="absolute right-3 top-full mt-1 min-w-[160px] rounded-lg border border-[var(--app-border)] bg-[var(--app-bg)] shadow-lg overflow-hidden z-50"
                                    role="listbox"
                                    aria-label="语言"
                                >
                                    {sttLanguageOptions.map((opt) => {
                                        const isSelected = sttLanguage === opt.value
                                        return (
                                            <button
                                                key={opt.value}
                                                type="button"
                                                role="option"
                                                aria-selected={isSelected}
                                                onClick={() => {
                                                    setSttLanguage(opt.value)
                                                    setIsSttLanguageOpen(false)
                                                }}
                                                className={`flex items-center justify-between w-full px-3 py-2 text-base text-left transition-colors ${
                                                    isSelected
                                                        ? 'text-[var(--app-link)] bg-[var(--app-subtle-bg)]'
                                                        : 'text-[var(--app-fg)] hover:bg-[var(--app-subtle-bg)]'
                                                }`}
                                            >
                                                <span>{opt.label}</span>
                                                {isSelected && (
                                                    <span className="ml-2 text-[var(--app-link)]">
                                                        <CheckIcon />
                                                    </span>
                                                )}
                                            </button>
                                        )
                                    })}
                                </div>
                            )}
                        </div>
                        <div className="flex gap-2 px-3 py-3">
                            <button
                                type="button"
                                disabled={sttSaving}
                                onClick={async () => {
                                    setSttSaving(true)
                                    try {
                                        await updateConfig({
                                            provider: sttProvider,
                                            appId: sttProvider === 'tencent' ? sttAppId : sttAppId_XF,
                                            secretId: sttProvider === 'tencent' ? sttSecretId : undefined,
                                            secretKey: sttProvider === 'tencent' ? sttSecretKey : undefined,
                                            apiKey: sttProvider === 'xunfei' ? sttApiKey : undefined,
                                            apiSecret: sttProvider === 'xunfei' ? sttApiSecret : undefined,
                                            language: sttLanguage,
                                            region: STT_DEFAULT_REGION,
                                        })
                                    } catch {
                                        // error is handled by mutation
                                    } finally {
                                        setSttSaving(false)
                                    }
                                }}
                                className="flex-1 rounded-lg border border-[var(--app-border)] bg-transparent px-4 py-2 text-sm font-medium text-[var(--app-fg)] transition-colors hover:bg-[var(--app-subtle-bg)] disabled:cursor-not-allowed disabled:opacity-50"
                            >
                                {sttSaving ? '保存中...' : '保存'}
                            </button>
                            <button
                                type="button"
                                disabled={sttActivating}
                                onClick={async () => {
                                    const appId = sttProvider === 'tencent' ? sttAppId : sttAppId_XF
                                    const hasCredentials = sttProvider === 'tencent'
                                        ? !!(appId && sttSecretId && sttSecretKey)
                                        : !!(appId && sttApiKey && sttApiSecret)
                                    if (!hasCredentials) {
                                        alert(sttProvider === 'tencent'
                                            ? '请先填写完整的腾讯云配置（AppID、SecretId、SecretKey）'
                                            : '请先填写完整的讯飞配置（AppID、APIKey、APISecret）')
                                        return
                                    }
                                    setSttActivating(true)
                                    try {
                                        await setActive(sttProvider)
                                    } catch {
                                        // error is handled by mutation
                                    } finally {
                                        setSttActivating(false)
                                    }
                                }}
                                className={`flex-1 rounded-lg px-4 py-2 text-sm font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-50 ${
                                    activeConfig?.provider === sttProvider
                                        ? 'border border-[#34C759] bg-transparent text-[#34C759]'
                                        : 'border border-[var(--app-link)] bg-[var(--app-link)] text-white hover:opacity-90'
                                }`}
                            >
                                {sttActivating ? '启用中...' : activeConfig?.provider === sttProvider ? '已启用' : '启用'}
                            </button>
                        </div>
                        <div className="flex items-center gap-1.5 px-3 pb-3 flex-wrap">
                            {configs.map(cfg => (
                                <div key={cfg.provider} className="flex items-center gap-1">
                                    <span className={`h-2 w-2 rounded-full ${cfg.active ? 'bg-[#34C759]' : 'bg-[#999]'}`} />
                                    <span className={`text-xs ${cfg.active ? 'text-[#34C759]' : 'text-[#999]'}`}>
                                        {cfg.provider === 'tencent' ? '腾讯云' : '讯飞'}
                                        {cfg.active ? ' (活跃)' : ''}
                                    </span>
                                </div>
                            ))}
                        </div>
                    </div>
                </div>
            </div>
        </div>
    )
}
