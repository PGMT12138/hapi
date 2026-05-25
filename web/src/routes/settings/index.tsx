import { useState, useRef, useEffect } from 'react'
import { useTranslation, type Locale } from '@/lib/use-translation'
import { useAppGoBack } from '@/hooks/useAppGoBack'
import { useNavigate } from '@tanstack/react-router'
import { getElevenLabsSupportedLanguages, getLanguageDisplayName, type Language } from '@/lib/languages'
import { getFontScaleOptions, useFontScale, type FontScale } from '@/hooks/useFontScale'
import { getTerminalFontSizeOptions, useTerminalFontSize, type TerminalFontSize } from '@/hooks/useTerminalFontSize'
import { getComposerEnterBehaviorOptions, useComposerEnterBehavior, type ComposerEnterBehavior } from '@/hooks/useComposerEnterBehavior'
import { getTerminalToolDisplayModeOptions, useTerminalToolDisplayMode, type TerminalToolDisplayMode } from '@/hooks/useTerminalToolDisplayMode'
import {
    getChatSurfaceColorPickerValue,
    getChatSurfaceColorPresetOptions,
    toCustomChatSurfaceColorPreference,
    toPresetChatSurfaceColorPreference,
    useChatSurfaceColors,
    type ChatSurfaceColorPreference,
    type ChatSurfaceColorPreset,
} from '@/hooks/useChatSurfaceColors'
import { useAppearance, getAppearanceOptions, type AppearancePreference, useTheme } from '@/hooks/useTheme'
import { usePlatform } from '@/hooks/usePlatform'
import { PROTOCOL_VERSION } from '@hapi/protocol'
import { useAppContext } from '@/lib/app-context'
import { useSttConfig } from '@/hooks/queries/useSttConfig'
import { useSttConfigActions } from '@/hooks/mutations/useSttConfigActions'
import { STT_DEFAULT_LANGUAGE, STT_DEFAULT_REGION } from '@hapi/protocol/stt'

const locales: { value: Locale; nativeLabel: string }[] = [
    { value: 'en', nativeLabel: 'English' },
    { value: 'zh-CN', nativeLabel: '简体中文' },
]

const voiceLanguages = getElevenLabsSupportedLanguages()

const sttProviderOptions: { value: string; label: string }[] = [
    { value: 'tencent', label: '腾讯云' },
]

const sttLanguageOptions: { value: string; label: string }[] = [
    { value: 'auto', label: '自动检测' },
    { value: 'zh', label: '中文' },
    { value: 'en', label: '英文' },
]

function BackIcon(props: { className?: string }) {
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
            className={props.className}
        >
            <polyline points="15 18 9 12 15 6" />
        </svg>
    )
}

function CheckIcon(props: { className?: string }) {
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
            className={props.className}
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

function ChatSurfaceColorControl(props: {
    label: string
    preference: ChatSurfaceColorPreference
    onPresetChange: (preset: ChatSurfaceColorPreset) => void
    onCustomChange: (value: string) => void
    t: (key: string) => string
}) {
    const presetOptions = getChatSurfaceColorPresetOptions()
    const pickerValue = getChatSurfaceColorPickerValue(props.preference)
    const isCustomSelected = props.preference.startsWith('custom:')

    return (
        <div className="border-t border-[var(--app-divider)] px-3 py-3">
            <div className="mb-2 text-[var(--app-fg)]">{props.label}</div>
            <div className="flex flex-wrap gap-2">
                {presetOptions.map((option) => {
                    const selected = props.preference === toPresetChatSurfaceColorPreference(option.value)
                    const swatchColor = getChatSurfaceColorPickerValue(toPresetChatSurfaceColorPreference(option.value))
                    return (
                        <button
                            key={option.value}
                            type="button"
                            onClick={() => props.onPresetChange(option.value)}
                            className={`inline-flex items-center gap-2 rounded-full border px-3 py-1.5 text-sm transition-colors ${
                                selected
                                    ? 'border-[var(--app-link)] bg-[var(--app-subtle-bg)] text-[var(--app-link)]'
                                    : 'border-[var(--app-border)] bg-[var(--app-bg)] text-[var(--app-fg)] hover:bg-[var(--app-subtle-bg)]'
                            }`}
                        >
                            <span className="h-2.5 w-2.5 rounded-full opacity-80" style={{ backgroundColor: swatchColor }} />
                            <span>{props.t(option.labelKey)}</span>
                        </button>
                    )
                })}
            </div>
            <div className="mt-3 flex items-center justify-between gap-3">
                <span className="text-sm text-[var(--app-hint)]">{props.t('settings.chat.surfaceColor.custom')}</span>
                <label
                    className={`inline-flex items-center rounded-xl border px-2 py-1 transition-colors ${
                        isCustomSelected
                            ? 'border-[var(--app-link)] bg-[var(--app-subtle-bg)]'
                            : 'border-[var(--app-border)] bg-[var(--app-bg)]'
                    }`}
                >
                    <input
                        aria-label={props.t('settings.chat.surfaceColor.custom')}
                        type="color"
                        value={pickerValue}
                        onChange={(event) => props.onCustomChange(event.target.value)}
                        className="h-8 w-11 cursor-pointer appearance-none border-0 bg-transparent p-0"
                    />
                </label>
            </div>
        </div>
    )
}

export default function SettingsPage() {
    const { t, locale, setLocale } = useTranslation()
    const goBack = useAppGoBack()
    const navigate = useNavigate()
    const [isOpen, setIsOpen] = useState(false)
    const [isAppearanceOpen, setIsAppearanceOpen] = useState(false)
    const [isFontOpen, setIsFontOpen] = useState(false)
    const [isTerminalFontOpen, setIsTerminalFontOpen] = useState(false)
    const [isChatOpen, setIsChatOpen] = useState(false)
    const [isTerminalToolDisplayOpen, setIsTerminalToolDisplayOpen] = useState(false)
    const [isVoiceOpen, setIsVoiceOpen] = useState(false)
    const [isSttOpen, setIsSttOpen] = useState(false)
    const containerRef = useRef<HTMLDivElement>(null)
    const appearanceContainerRef = useRef<HTMLDivElement>(null)
    const fontContainerRef = useRef<HTMLDivElement>(null)
    const terminalFontContainerRef = useRef<HTMLDivElement>(null)
    const chatContainerRef = useRef<HTMLDivElement>(null)
    const terminalToolDisplayContainerRef = useRef<HTMLDivElement>(null)
    const voiceContainerRef = useRef<HTMLDivElement>(null)
    const sttContainerRef = useRef<HTMLDivElement>(null)
    const sttProviderContainerRef = useRef<HTMLDivElement>(null)
    const sttLanguageContainerRef = useRef<HTMLDivElement>(null)
    const { fontScale, setFontScale } = useFontScale()
    const { terminalFontSize, setTerminalFontSize } = useTerminalFontSize()
    const { composerEnterBehavior, setComposerEnterBehavior } = useComposerEnterBehavior()
    const { terminalToolDisplayMode, setTerminalToolDisplayMode } = useTerminalToolDisplayMode()
    const {
        toolGroupBackground,
        userMessageBackground,
        setToolGroupBackground,
        setUserMessageBackground,
    } = useChatSurfaceColors()
    const { appearance, setAppearance } = useAppearance()
    const { colorScheme } = useTheme()
    const { isNativeApp } = usePlatform()

    // Voice language state - read from localStorage
    const [voiceLanguage, setVoiceLanguage] = useState<string | null>(() => {
        return localStorage.getItem('hapi-voice-lang')
    })

    // STT config
    const { api: sttApi } = useAppContext()
    const { config } = useSttConfig(sttApi)
    const { updateConfig } = useSttConfigActions(sttApi)
    const [sttProvider, setSttProvider] = useState(config?.provider ?? 'tencent')
    const [sttAppId, setSttAppId] = useState(config?.appId ?? '')
    const [sttSecretId, setSttSecretId] = useState(config?.secretId ?? '')
    const [sttSecretKey, setSttSecretKey] = useState(config?.secretKey ?? '')
    const [sttLanguage, setSttLanguage] = useState(config?.language ?? 'zh')
    const [showSecretKey, setShowSecretKey] = useState(false)
    const [sttSaving, setSttSaving] = useState(false)

    // Sync local STT form state when config loads/changes
    useEffect(() => {
        if (config) {
            setSttProvider(config.provider)
            setSttAppId(config.appId)
            setSttSecretId(config.secretId)
            setSttSecretKey(config.secretKey)
            setSttLanguage(config.language)
        }
    }, [config])

    const fontScaleOptions = getFontScaleOptions()
    const terminalFontSizeOptions = getTerminalFontSizeOptions()
    const composerEnterBehaviorOptions = getComposerEnterBehaviorOptions()
    const terminalToolDisplayModeOptions = getTerminalToolDisplayModeOptions()
    const appearanceOptions = getAppearanceOptions()
    const currentLocale = locales.find((loc) => loc.value === locale)
    const currentAppearanceLabel = appearanceOptions.find((opt) => opt.value === appearance)?.labelKey ?? 'settings.display.appearance.system'
    const currentFontScaleLabel = fontScaleOptions.find((opt) => opt.value === fontScale)?.label ?? '100%'
    const currentTerminalFontSizeLabel = terminalFontSizeOptions.find((opt) => opt.value === terminalFontSize)?.label ?? '13px'
    const currentComposerEnterBehaviorLabel = composerEnterBehaviorOptions.find((opt) => opt.value === composerEnterBehavior)?.labelKey ?? 'settings.chat.enterBehavior.send'
    const currentTerminalToolDisplayModeLabel = terminalToolDisplayModeOptions.find((opt) => opt.value === terminalToolDisplayMode)?.labelKey ?? 'settings.chat.terminalToolDisplay.compact'
    const currentVoiceLanguage = voiceLanguages.find((lang) => lang.code === voiceLanguage)

    const handleLocaleChange = (newLocale: Locale) => {
        setLocale(newLocale)
        setIsOpen(false)
    }

    const handleAppearanceChange = (pref: AppearancePreference) => {
        setAppearance(pref)
        setIsAppearanceOpen(false)
    }

    const handleFontScaleChange = (newScale: FontScale) => {
        setFontScale(newScale)
        setIsFontOpen(false)
    }

    const handleTerminalFontSizeChange = (newSize: TerminalFontSize) => {
        setTerminalFontSize(newSize)
        setIsTerminalFontOpen(false)
    }

    const handleComposerEnterBehaviorChange = (newBehavior: ComposerEnterBehavior) => {
        setComposerEnterBehavior(newBehavior)
        setIsChatOpen(false)
    }

    const handleTerminalToolDisplayModeChange = (newMode: TerminalToolDisplayMode) => {
        setTerminalToolDisplayMode(newMode)
        setIsTerminalToolDisplayOpen(false)
    }

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
        if (!isOpen && !isAppearanceOpen && !isFontOpen && !isTerminalFontOpen && !isChatOpen && !isTerminalToolDisplayOpen && !isVoiceOpen && !isSttOpen) return

        const handleClickOutside = (event: MouseEvent) => {
            if (isOpen && containerRef.current && !containerRef.current.contains(event.target as Node)) {
                setIsOpen(false)
            }
            if (isAppearanceOpen && appearanceContainerRef.current && !appearanceContainerRef.current.contains(event.target as Node)) {
                setIsAppearanceOpen(false)
            }
            if (isFontOpen && fontContainerRef.current && !fontContainerRef.current.contains(event.target as Node)) {
                setIsFontOpen(false)
            }
            if (isTerminalFontOpen && terminalFontContainerRef.current && !terminalFontContainerRef.current.contains(event.target as Node)) {
                setIsTerminalFontOpen(false)
            }
            if (isChatOpen && chatContainerRef.current && !chatContainerRef.current.contains(event.target as Node)) {
                setIsChatOpen(false)
            }
            if (isTerminalToolDisplayOpen && terminalToolDisplayContainerRef.current && !terminalToolDisplayContainerRef.current.contains(event.target as Node)) {
                setIsTerminalToolDisplayOpen(false)
            }
            if (isVoiceOpen && voiceContainerRef.current && !voiceContainerRef.current.contains(event.target as Node)) {
                setIsVoiceOpen(false)
            }
            if (isSttOpen) {
                const allSttRefs = [sttProviderContainerRef, sttLanguageContainerRef]
                const clickedInside = allSttRefs.some(ref => ref.current && ref.current.contains(event.target as Node))
                if (!clickedInside) {
                    setIsSttOpen(false)
                }
            }
        }

        document.addEventListener('mousedown', handleClickOutside)
        return () => document.removeEventListener('mousedown', handleClickOutside)
    }, [isOpen, isAppearanceOpen, isFontOpen, isTerminalFontOpen, isChatOpen, isTerminalToolDisplayOpen, isVoiceOpen, isSttOpen])

    // Close on escape key
    useEffect(() => {
        if (!isOpen && !isAppearanceOpen && !isFontOpen && !isTerminalFontOpen && !isChatOpen && !isTerminalToolDisplayOpen && !isVoiceOpen && !isSttOpen) return

        const handleEscape = (event: KeyboardEvent) => {
            if (event.key === 'Escape') {
                setIsOpen(false)
                setIsAppearanceOpen(false)
                setIsFontOpen(false)
                setIsTerminalFontOpen(false)
                setIsChatOpen(false)
                setIsTerminalToolDisplayOpen(false)
                setIsVoiceOpen(false)
                setIsSttOpen(false)
            }
        }

        document.addEventListener('keydown', handleEscape)
        return () => document.removeEventListener('keydown', handleEscape)
    }, [isOpen, isAppearanceOpen, isFontOpen, isTerminalFontOpen, isChatOpen, isTerminalToolDisplayOpen, isVoiceOpen, isSttOpen])

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
                    <div className="flex-1 font-semibold">{t('settings.title')}</div>
                </div>
            </div>

            <div className="app-scroll-y flex-1 min-h-0">
                <div className="mx-auto w-full max-w-content">
                    {/* Language section */}
                    <div className="border-b border-[var(--app-divider)]">
                        <div className="px-3 py-2 text-xs font-semibold text-[var(--app-hint)] uppercase tracking-wide">
                            {t('settings.language.title')}
                        </div>
                        <div ref={containerRef} className="relative">
                            <button
                                type="button"
                                onClick={() => setIsOpen(!isOpen)}
                                className="flex w-full items-center justify-between px-3 py-3 text-left transition-colors hover:bg-[var(--app-subtle-bg)]"
                                aria-expanded={isOpen}
                                aria-haspopup="listbox"
                            >
                                <span className="text-[var(--app-fg)]">{t('settings.language.label')}</span>
                                <span className="flex items-center gap-1 text-[var(--app-hint)]">
                                    <span>{currentLocale?.nativeLabel}</span>
                                    <ChevronDownIcon className={`transition-transform ${isOpen ? 'rotate-180' : ''}`} />
                                </span>
                            </button>

                            {isOpen && (
                                <div
                                    className="absolute right-3 top-full mt-1 min-w-[160px] rounded-lg border border-[var(--app-border)] bg-[var(--app-bg)] shadow-lg overflow-hidden z-50"
                                    role="listbox"
                                    aria-label={t('settings.language.title')}
                                >
                                    {locales.map((loc) => {
                                        const isSelected = locale === loc.value
                                        return (
                                            <button
                                                key={loc.value}
                                                type="button"
                                                role="option"
                                                aria-selected={isSelected}
                                                onClick={() => handleLocaleChange(loc.value)}
                                                className={`flex items-center justify-between w-full px-3 py-2 text-base text-left transition-colors ${
                                                    isSelected
                                                        ? 'text-[var(--app-link)] bg-[var(--app-subtle-bg)]'
                                                        : 'text-[var(--app-fg)] hover:bg-[var(--app-subtle-bg)]'
                                                }`}
                                            >
                                                <span>{loc.nativeLabel}</span>
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

                    {/* Display section */}
                    <div className="border-b border-[var(--app-divider)]">
                        <div className="px-3 py-2 text-xs font-semibold text-[var(--app-hint)] uppercase tracking-wide">
                            {t('settings.display.title')}
                        </div>
                        <div ref={appearanceContainerRef} className="relative">
                            <button
                                type="button"
                                onClick={() => setIsAppearanceOpen(!isAppearanceOpen)}
                                className="flex w-full items-center justify-between px-3 py-3 text-left transition-colors hover:bg-[var(--app-subtle-bg)]"
                                aria-expanded={isAppearanceOpen}
                                aria-haspopup="listbox"
                            >
                                <span className="text-[var(--app-fg)]">{t('settings.display.appearance')}</span>
                                <span className="flex items-center gap-1 text-[var(--app-hint)]">
                                    <span>{t(currentAppearanceLabel)}</span>
                                    <ChevronDownIcon className={`transition-transform ${isAppearanceOpen ? 'rotate-180' : ''}`} />
                                </span>
                            </button>

                            {isAppearanceOpen && (
                                <div
                                    className="absolute right-3 top-full mt-1 min-w-[160px] rounded-lg border border-[var(--app-border)] bg-[var(--app-bg)] shadow-lg overflow-hidden z-50"
                                    role="listbox"
                                    aria-label={t('settings.display.appearance')}
                                >
                                    {appearanceOptions.map((opt) => {
                                        const isSelected = appearance === opt.value
                                        return (
                                            <button
                                                key={opt.value}
                                                type="button"
                                                role="option"
                                                aria-selected={isSelected}
                                                onClick={() => handleAppearanceChange(opt.value)}
                                                className={`flex items-center justify-between w-full px-3 py-2 text-base text-left transition-colors ${
                                                    isSelected
                                                        ? 'text-[var(--app-link)] bg-[var(--app-subtle-bg)]'
                                                        : 'text-[var(--app-fg)] hover:bg-[var(--app-subtle-bg)]'
                                                }`}
                                            >
                                                <span>{t(opt.labelKey)}</span>
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
                        {appearance === 'system' && (
                            <div className="px-3 py-2 text-xs text-[var(--app-hint)]">
                                {t('settings.display.systemDetected')}: {colorScheme === 'dark' ? t('settings.display.appearance.dark') : t('settings.display.appearance.light')}
                            </div>
                        )}
                        <div ref={fontContainerRef} className="relative">
                            <button
                                type="button"
                                onClick={() => setIsFontOpen(!isFontOpen)}
                                className="flex w-full items-center justify-between px-3 py-3 text-left transition-colors hover:bg-[var(--app-subtle-bg)]"
                                aria-expanded={isFontOpen}
                                aria-haspopup="listbox"
                            >
                                <span className="text-[var(--app-fg)]">{t('settings.display.fontSize')}</span>
                                <span className="flex items-center gap-1 text-[var(--app-hint)]">
                                    <span>{currentFontScaleLabel}</span>
                                    <ChevronDownIcon className={`transition-transform ${isFontOpen ? 'rotate-180' : ''}`} />
                                </span>
                            </button>

                            {isFontOpen && (
                                <div
                                    className="absolute right-3 top-full mt-1 min-w-[140px] rounded-lg border border-[var(--app-border)] bg-[var(--app-bg)] shadow-lg overflow-hidden z-50"
                                    role="listbox"
                                    aria-label={t('settings.display.fontSize')}
                                >
                                    {fontScaleOptions.map((opt) => {
                                        const isSelected = fontScale === opt.value
                                        return (
                                            <button
                                                key={opt.value}
                                                type="button"
                                                role="option"
                                                aria-selected={isSelected}
                                                onClick={() => handleFontScaleChange(opt.value)}
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
                        <div ref={terminalFontContainerRef} className="relative">
                            <button
                                type="button"
                                onClick={() => setIsTerminalFontOpen(!isTerminalFontOpen)}
                                className="flex w-full items-center justify-between px-3 py-3 text-left transition-colors hover:bg-[var(--app-subtle-bg)]"
                                aria-expanded={isTerminalFontOpen}
                                aria-haspopup="listbox"
                            >
                                <span className="text-[var(--app-fg)]">{t('settings.display.terminalFontSize')}</span>
                                <span className="flex items-center gap-1 text-[var(--app-hint)]">
                                    <span>{currentTerminalFontSizeLabel}</span>
                                    <ChevronDownIcon className={`transition-transform ${isTerminalFontOpen ? 'rotate-180' : ''}`} />
                                </span>
                            </button>

                            {isTerminalFontOpen && (
                                <div
                                    className="absolute right-3 top-full mt-1 min-w-[140px] rounded-lg border border-[var(--app-border)] bg-[var(--app-bg)] shadow-lg overflow-hidden z-50"
                                    role="listbox"
                                    aria-label={t('settings.display.terminalFontSize')}
                                >
                                    {terminalFontSizeOptions.map((opt) => {
                                        const isSelected = terminalFontSize === opt.value
                                        return (
                                            <button
                                                key={opt.value}
                                                type="button"
                                                role="option"
                                                aria-selected={isSelected}
                                                onClick={() => handleTerminalFontSizeChange(opt.value)}
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
                    </div>

                    {/* Chat section */}
                    <div className="border-b border-[var(--app-divider)]">
                        <div className="px-3 py-2 text-xs font-semibold text-[var(--app-hint)] uppercase tracking-wide">
                            {t('settings.chat.title')}
                        </div>
                        <div ref={chatContainerRef} className="relative">
                            <button
                                type="button"
                                onClick={() => setIsChatOpen(!isChatOpen)}
                                className="flex w-full items-center justify-between px-3 py-3 text-left transition-colors hover:bg-[var(--app-subtle-bg)]"
                                aria-expanded={isChatOpen}
                                aria-haspopup="listbox"
                            >
                                <span className="text-[var(--app-fg)]">{t('settings.chat.enterBehavior')}</span>
                                <span className="flex items-center gap-1 text-[var(--app-hint)]">
                                    <span>{t(currentComposerEnterBehaviorLabel)}</span>
                                    <ChevronDownIcon className={`transition-transform ${isChatOpen ? 'rotate-180' : ''}`} />
                                </span>
                            </button>

                            {isChatOpen && (
                                <div
                                    className="absolute right-3 top-full mt-1 min-w-[170px] rounded-lg border border-[var(--app-border)] bg-[var(--app-bg)] shadow-lg overflow-hidden z-50"
                                    role="listbox"
                                    aria-label={t('settings.chat.enterBehavior')}
                                >
                                    {composerEnterBehaviorOptions.map((opt) => {
                                        const isSelected = composerEnterBehavior === opt.value
                                        return (
                                            <button
                                                key={opt.value}
                                                type="button"
                                                role="option"
                                                aria-selected={isSelected}
                                                onClick={() => handleComposerEnterBehaviorChange(opt.value)}
                                                className={`flex items-center justify-between w-full px-3 py-2 text-base text-left transition-colors ${
                                                    isSelected
                                                        ? 'text-[var(--app-link)] bg-[var(--app-subtle-bg)]'
                                                        : 'text-[var(--app-fg)] hover:bg-[var(--app-subtle-bg)]'
                                                }`}
                                            >
                                                <span>{t(opt.labelKey)}</span>
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
                        <div ref={terminalToolDisplayContainerRef} className="relative">
                            <button
                                type="button"
                                onClick={() => setIsTerminalToolDisplayOpen(!isTerminalToolDisplayOpen)}
                                className="flex w-full items-center justify-between px-3 py-3 text-left transition-colors hover:bg-[var(--app-subtle-bg)]"
                                aria-expanded={isTerminalToolDisplayOpen}
                                aria-haspopup="listbox"
                            >
                                <span className="text-[var(--app-fg)]">{t('settings.chat.terminalToolDisplay')}</span>
                                <span className="flex items-center gap-1 text-[var(--app-hint)]">
                                    <span>{t(currentTerminalToolDisplayModeLabel)}</span>
                                    <ChevronDownIcon className={`transition-transform ${isTerminalToolDisplayOpen ? 'rotate-180' : ''}`} />
                                </span>
                            </button>

                            {isTerminalToolDisplayOpen && (
                                <div
                                    className="absolute right-3 top-full mt-1 min-w-[230px] rounded-lg border border-[var(--app-border)] bg-[var(--app-bg)] shadow-lg overflow-hidden z-50"
                                    role="listbox"
                                    aria-label={t('settings.chat.terminalToolDisplay')}
                                >
                                    {terminalToolDisplayModeOptions.map((opt) => {
                                        const isSelected = terminalToolDisplayMode === opt.value
                                        return (
                                            <button
                                                key={opt.value}
                                                type="button"
                                                role="option"
                                                aria-selected={isSelected}
                                                onClick={() => handleTerminalToolDisplayModeChange(opt.value)}
                                                className={`flex items-center justify-between w-full px-3 py-2 text-base text-left transition-colors ${
                                                    isSelected
                                                        ? 'text-[var(--app-link)] bg-[var(--app-subtle-bg)]'
                                                        : 'text-[var(--app-fg)] hover:bg-[var(--app-subtle-bg)]'
                                                }`}
                                            >
                                                <span>{t(opt.labelKey)}</span>
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
                        <ChatSurfaceColorControl
                            label={t('settings.chat.groupedToolBackground')}
                            preference={toolGroupBackground}
                            onPresetChange={(preset) => setToolGroupBackground(toPresetChatSurfaceColorPreference(preset))}
                            onCustomChange={(value) => setToolGroupBackground(toCustomChatSurfaceColorPreference(value))}
                            t={t}
                        />
                        <ChatSurfaceColorControl
                            label={t('settings.chat.userMessageBackground')}
                            preference={userMessageBackground}
                            onPresetChange={(preset) => setUserMessageBackground(toPresetChatSurfaceColorPreference(preset))}
                            onCustomChange={(value) => setUserMessageBackground(toCustomChatSurfaceColorPreference(value))}
                            t={t}
                        />
                    </div>

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
                                onClick={() => setIsSttOpen(!isSttOpen)}
                                className="flex w-full items-center justify-between px-3 py-3 text-left transition-colors hover:bg-[var(--app-subtle-bg)]"
                                aria-expanded={isSttOpen}
                                aria-haspopup="listbox"
                            >
                                <span className="text-[var(--app-fg)]">服务商</span>
                                <span className="flex items-center gap-1 text-[var(--app-hint)]">
                                    <span>{sttProviderOptions.find(o => o.value === sttProvider)?.label ?? '腾讯云'}</span>
                                    <ChevronDownIcon className={`transition-transform ${isSttOpen ? 'rotate-180' : ''}`} />
                                </span>
                            </button>

                            {isSttOpen && (
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
                                                    setIsSttOpen(false)
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
                                value={sttAppId}
                                onChange={(e) => setSttAppId(e.target.value)}
                                placeholder="输入 AppID"
                                className="w-full rounded-lg border border-[var(--app-border)] bg-[var(--app-bg)] px-3 py-2 text-sm text-[var(--app-fg)] placeholder-[var(--app-hint)] focus:outline-none focus:border-[var(--app-link)]"
                            />
                        </div>
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
                        <div ref={sttLanguageContainerRef} className="relative">
                            <button
                                type="button"
                                onClick={() => setIsSttOpen(!isSttOpen)}
                                className="flex w-full items-center justify-between px-3 py-3 text-left transition-colors hover:bg-[var(--app-subtle-bg)]"
                                aria-expanded={isSttOpen}
                                aria-haspopup="listbox"
                            >
                                <span className="text-[var(--app-fg)]">语言</span>
                                <span className="flex items-center gap-1 text-[var(--app-hint)]">
                                    <span>{sttLanguageOptions.find(o => o.value === sttLanguage)?.label ?? '中文'}</span>
                                    <ChevronDownIcon className={`transition-transform ${isSttOpen ? 'rotate-180' : ''}`} />
                                </span>
                            </button>

                            {isSttOpen && (
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
                                                    setIsSttOpen(false)
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
                        <div className="px-3 py-3">
                            <button
                                type="button"
                                disabled={sttSaving}
                                onClick={async () => {
                                    setSttSaving(true)
                                    try {
                                        await updateConfig({
                                            provider: sttProvider,
                                            appId: sttAppId,
                                            secretId: sttSecretId,
                                            secretKey: sttSecretKey,
                                            language: sttLanguage,
                                            region: STT_DEFAULT_REGION,
                                        })
                                    } catch {
                                        // error is handled by mutation
                                    } finally {
                                        setSttSaving(false)
                                    }
                                }}
                                className="w-full rounded-lg bg-[var(--app-link)] px-4 py-2 text-sm font-medium text-white transition-colors hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
                            >
                                {sttSaving ? '保存中...' : '保存'}
                            </button>
                        </div>
                        <div className="flex items-center gap-1.5 px-3 pb-3">
                            <span
                                className={`h-2 w-2 rounded-full ${
                                    sttAppId && sttSecretId && sttSecretKey
                                        ? 'bg-[#34C759]'
                                        : 'bg-[#999]'
                                }`}
                            />
                            <span className={`text-xs ${
                                sttAppId && sttSecretId && sttSecretKey
                                    ? 'text-[#34C759]'
                                    : 'text-[#999]'
                            }`}>
                                {sttAppId && sttSecretId && sttSecretKey ? '已配置' : '未配置'}
                            </span>
                        </div>
                    </div>

                    {/* Navigation section */}
                    <div className="border-b border-[var(--app-divider)]">
                        <div className="px-3 py-2 text-xs font-semibold text-[var(--app-hint)] uppercase tracking-wide">
                            {t('modelPresets.nav')}
                        </div>
                        <button
                            type="button"
                            onClick={() => navigate({ to: '/model-presets' })}
                            className="flex w-full items-center justify-between px-3 py-3 text-left transition-colors hover:bg-[var(--app-subtle-bg)]"
                        >
                            <span className="text-[var(--app-fg)]">{t('modelPresets.title')}</span>
                            <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24"
                                fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"
                                className="text-[var(--app-hint)]">
                                <polyline points="9 18 15 12 9 6" />
                            </svg>
                        </button>
                        <button
                            type="button"
                            onClick={() => navigate({ to: '/prompts' })}
                            className="flex w-full items-center justify-between px-3 py-3 text-left transition-colors hover:bg-[var(--app-subtle-bg)]"
                        >
                            <span className="text-[var(--app-fg)]">{t('prompts.nav')}</span>
                            <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24"
                                fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"
                                className="text-[var(--app-hint)]">
                                <polyline points="9 18 15 12 9 6" />
                            </svg>
                        </button>
                    </div>

                    {/* Server config section (native app only) */}
                    {isNativeApp && (
                        <div className="border-b border-[var(--app-divider)]">
                            <button
                                type="button"
                                onClick={() => {
                                    const bridge = (globalThis as Record<string, unknown>).HapiBridge as { openSettings?: () => void } | undefined
                                    bridge?.openSettings?.()
                                }}
                                className="flex w-full items-center justify-between px-3 py-3 text-left transition-colors hover:bg-[var(--app-subtle-bg)]"
                            >
                                <span className="text-[var(--app-fg)]">{t('settings.serverConfig')}</span>
                                <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24"
                                    fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"
                                    className="text-[var(--app-hint)]">
                                    <polyline points="9 18 15 12 9 6" />
                                </svg>
                            </button>
                        </div>
                    )}

                    {/* About section */}
                    <div className="border-b border-[var(--app-divider)]">
                        <div className="px-3 py-2 text-xs font-semibold text-[var(--app-hint)] uppercase tracking-wide">
                            {t('settings.about.title')}
                        </div>
                        <div className="flex w-full items-center justify-between px-3 py-3">
                            <span className="text-[var(--app-fg)]">{t('settings.about.website')}</span>
                            <a
                                href="https://hapi.run"
                                target="_blank"
                                rel="noopener noreferrer"
                                className="text-[var(--app-link)] hover:underline"
                            >
                                hapi.run
                            </a>
                        </div>
                        <div className="flex w-full items-center justify-between px-3 py-3">
                            <span className="text-[var(--app-fg)]">{t('settings.about.appVersion')}</span>
                            <span className="text-[var(--app-hint)]">{__APP_VERSION__}</span>
                        </div>
                        <div className="flex w-full items-center justify-between px-3 py-3">
                            <span className="text-[var(--app-fg)]">{t('settings.about.protocolVersion')}</span>
                            <span className="text-[var(--app-hint)]">{PROTOCOL_VERSION}</span>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    )
}
