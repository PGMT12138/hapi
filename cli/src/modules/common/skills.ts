import { access, readdir, readFile } from 'fs/promises';
import { basename, dirname, join, resolve } from 'path';
import { homedir } from 'os';
import { parse as parseYaml } from 'yaml';

export interface SkillSummary {
    name: string;
    folderName: string;
    description?: string;
}

export interface SkillDetail {
    name: string;
    description?: string;
    content: string;
    files: string[];
    path: string;
}

export interface ListSkillsRequest {
}

export interface ListSkillsResponse {
    success: boolean;
    skills?: SkillSummary[];
    error?: string;
}

function getHomeDirectory(): string {
    return process.env.HOME ?? process.env.USERPROFILE ?? homedir();
}

function getUserSkillsRoots(): string[] {
    const home = getHomeDirectory();
    return [
        join(home, '.agents', 'skills'),
        join(home, '.claude', 'skills'),
        join(home, '.codex', 'skills'),
    ];
}

function getAdminSkillsRoot(): string {
    return join('/etc', 'codex', 'skills');
}

function getProjectSkillsRoots(directory: string): string[] {
    return [
        join(directory, '.agents', 'skills'),
        join(directory, '.claude', 'skills'),
        join(directory, '.codex', 'skills'),
    ];
}

async function pathExists(path: string): Promise<boolean> {
    try {
        await access(path);
        return true;
    } catch {
        return false;
    }
}

async function listProjectSkillsRoots(workingDirectory?: string): Promise<string[]> {
    if (!workingDirectory) {
        return [];
    }

    const resolvedWorkingDirectory = resolve(workingDirectory);
    const directories = [resolvedWorkingDirectory];
    let currentDirectory = resolvedWorkingDirectory;

    while (true) {
        if (await pathExists(join(currentDirectory, '.git'))) {
            return directories.flatMap(getProjectSkillsRoots);
        }

        const parentDirectory = dirname(currentDirectory);
        if (parentDirectory === currentDirectory) {
            return getProjectSkillsRoots(resolvedWorkingDirectory);
        }

        currentDirectory = parentDirectory;
        directories.push(currentDirectory);
    }
}

function parseFrontmatter(fileContent: string): { frontmatter?: Record<string, unknown>; body: string } {
    const match = fileContent.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/);
    if (!match) {
        return { body: fileContent.trim() };
    }

    const yamlContent = match[1];
    const body = match[2].trim();
    try {
        const parsed = parseYaml(yamlContent) as Record<string, unknown> | null;
        return { frontmatter: parsed ?? undefined, body };
    } catch {
        return { body: fileContent.trim() };
    }
}

function extractSkillSummary(skillDir: string, fileContent: string): SkillSummary | null {
    const parsed = parseFrontmatter(fileContent);
    const nameFromFrontmatter = typeof parsed.frontmatter?.name === 'string' ? parsed.frontmatter.name.trim() : '';
    const name = nameFromFrontmatter || basename(skillDir);
    if (!name) {
        return null;
    }

    const description = typeof parsed.frontmatter?.description === 'string'
        ? parsed.frontmatter.description.trim()
        : undefined;

    return { name, folderName: basename(skillDir), description };
}

async function listTopLevelSkillDirs(skillsRoot: string, options: { includeCodexSystem?: boolean } = {}): Promise<string[]> {
    try {
        const entries = await readdir(skillsRoot, { withFileTypes: true });
        const result: string[] = [];

        for (const entry of entries) {
            if (!entry.isDirectory() && !entry.isSymbolicLink()) {
                continue;
            }

            if (entry.name.startsWith('.')) {
                if (options.includeCodexSystem && entry.name === '.system') {
                    const systemEntries = await readdir(join(skillsRoot, entry.name), { withFileTypes: true }).catch(() => []);
                    for (const systemEntry of systemEntries) {
                        if ((systemEntry.isDirectory() || systemEntry.isSymbolicLink()) && !systemEntry.name.startsWith('.')) {
                            result.push(join(skillsRoot, entry.name, systemEntry.name));
                        }
                    }
                }
                continue;
            }

            result.push(join(skillsRoot, entry.name));
        }

        return result;
    } catch {
        return [];
    }
}

async function readSkillsFromDirs(skillDirs: string[]): Promise<SkillSummary[]> {
    const skills = await Promise.all(skillDirs.map(async (dir): Promise<SkillSummary | null> => {
        const filePath = join(dir, 'SKILL.md');
        try {
            const fileContent = await readFile(filePath, 'utf-8');
            return extractSkillSummary(dir, fileContent);
        } catch {
            return null;
        }
    }));

    return skills.filter((skill): skill is SkillSummary => skill !== null);
}

function isCodexSkillsRoot(root: string): boolean {
    return root.endsWith(join('.codex', 'skills'));
}

export interface SkillWithScope extends SkillSummary {
    scope: 'global' | 'project'
    projectPath?: string
}

export async function listClaudeCodeSkills(workingDirectory?: string): Promise<SkillWithScope[]> {
    const home = getHomeDirectory();
    const globalClaudeRoot = join(home, '.claude', 'skills');

    const projectClaudeRoots: string[] = [];
    let projectPath: string | undefined;

    if (workingDirectory) {
        const resolvedWd = resolve(workingDirectory);
        let current = resolvedWd;
        const dirs: string[] = [];

        while (true) {
            dirs.push(join(current, '.claude', 'skills'));
            if (await pathExists(join(current, '.git'))) {
                projectPath = current;
                break;
            }
            const parent = dirname(current);
            if (parent === current) {
                projectPath = resolvedWd;
                break;
            }
            current = parent;
        }

        projectClaudeRoots.push(...dirs);
    }

    const [globalDirs, projectDirs] = await Promise.all([
        listTopLevelSkillDirs(globalClaudeRoot),
        Promise.all(projectClaudeRoots.map(r => listTopLevelSkillDirs(r))).then(d => d.flat()),
    ]);

    const [globalSkills, projectSkills] = await Promise.all([
        readSkillsFromDirs(globalDirs),
        readSkillsFromDirs(projectDirs),
    ]);

    const result = new Map<string, SkillWithScope>();
    for (const skill of globalSkills) {
        result.set(skill.name, { ...skill, scope: 'global' });
    }
    for (const skill of projectSkills) {
        result.set(skill.name, { ...skill, scope: 'project', projectPath });
    }

    return [...result.values()].sort((a, b) => a.name.localeCompare(b.name));
}

export async function listSkills(workingDirectory?: string): Promise<SkillSummary[]> {
    const projectRoots = await listProjectSkillsRoots(workingDirectory);
    const userRoots = getUserSkillsRoots();
    const adminRoot = getAdminSkillsRoot();
    const [projectSkillDirs, userSkillDirs, adminSkillDirs] = await Promise.all([
        Promise.all(projectRoots.map(async (root) => await listTopLevelSkillDirs(root, { includeCodexSystem: isCodexSkillsRoot(root) }))).then((dirs) => dirs.flat()),
        Promise.all(userRoots.map(async (root) => await listTopLevelSkillDirs(root, { includeCodexSystem: isCodexSkillsRoot(root) }))).then((dirs) => dirs.flat()),
        listTopLevelSkillDirs(adminRoot, { includeCodexSystem: true }),
    ]);

    const [projectSkills, userSkills, adminSkills] = await Promise.all([
        readSkillsFromDirs(projectSkillDirs),
        readSkillsFromDirs(userSkillDirs),
        readSkillsFromDirs(adminSkillDirs),
    ]);

    const dedupedSkills = new Map<string, SkillSummary>();
    for (const skill of [
        ...projectSkills,
        ...userSkills,
        ...adminSkills,
    ]) {
        if (!dedupedSkills.has(skill.name)) {
            dedupedSkills.set(skill.name, skill);
        }
    }

    return [...dedupedSkills.values()].sort((a, b) => a.name.localeCompare(b.name));
}

async function findAllSkillDirs(workingDirectory?: string): Promise<Map<string, string>> {
    const projectRoots = await listProjectSkillsRoots(workingDirectory);
    const userRoots = getUserSkillsRoots();
    const adminRoot = getAdminSkillsRoot();
    const allRoots = [
        ...projectRoots,
        ...userRoots,
        adminRoot,
    ];

    const allDirs = (await Promise.all(
        allRoots.map(async (root) => await listTopLevelSkillDirs(root, { includeCodexSystem: isCodexSkillsRoot(root) }))
    )).flat();

    const nameToDir = new Map<string, string>();
    for (const dir of allDirs) {
        const filePath = join(dir, 'SKILL.md');
        try {
            const content = await readFile(filePath, 'utf-8');
            const parsed = parseFrontmatter(content);
            const name = (typeof parsed.frontmatter?.name === 'string' ? parsed.frontmatter.name.trim() : '') || basename(dir);
            if (name && !nameToDir.has(name)) {
                nameToDir.set(name, dir);
            }
        } catch {
            // skip unreadable
        }
    }
    return nameToDir;
}

export async function getSkillDetail(name: string, workingDirectory?: string): Promise<SkillDetail | null> {
    const nameToDir = await findAllSkillDirs(workingDirectory);
    const dir = nameToDir.get(name);
    if (!dir) return null;

    const skillMdPath = join(dir, 'SKILL.md');
    const content = await readFile(skillMdPath, 'utf-8');
    const parsed = parseFrontmatter(content);
    const description = typeof parsed.frontmatter?.description === 'string' ? parsed.frontmatter.description.trim() : undefined;

    const fileEntries = await readdir(dir, { withFileTypes: true, recursive: true });
    const prefix = dir.endsWith('/') ? dir : dir + '/';
    const files = fileEntries
        .filter(e => e.isFile() && !e.name.startsWith('.'))
        .map(e => {
            const fullPath = e.parentPath ? `${e.parentPath}/${e.name}` : e.name;
            return fullPath.startsWith(prefix) ? fullPath.slice(prefix.length) : e.name;
        });

    return { name, description, content, files, path: dir };
}
