import { ProjectDetector } from '../detection/detector.js';
import { ProjectType } from '../detection/project-types.js';
import fs from 'fs/promises';
import os from 'os';
import path from 'path';

describe('Project Detection', () => {
  let tempDir: string;
  let detector: ProjectDetector;

  beforeEach(async () => {
    detector = new ProjectDetector();
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'mcp-detection-test-'));
  });

  afterEach(async () => {
    try {
      await fs.rm(tempDir, { recursive: true, force: true });
    } catch {
      // Ignore cleanup errors
    }
  });

  describe('Laravel Detection', () => {
    it('should detect Laravel project', async () => {
      await fs.writeFile(
        path.join(tempDir, 'composer.json'),
        JSON.stringify({ require: { 'laravel/framework': '^10.0' } })
      );
      await fs.writeFile(path.join(tempDir, 'artisan'), '#!/usr/bin/env php');

      const result = await detector.detect(tempDir);

      expect(result.types).toContain(ProjectType.LARAVEL);
      expect(result.primaryType).toBe(ProjectType.LARAVEL);
      expect(result.analysis.language).toBe('PHP');
      expect(result.analysis.framework).toBe('Laravel');
    });

    it('should detect generic PHP project without artisan', async () => {
      await fs.writeFile(
        path.join(tempDir, 'composer.json'),
        JSON.stringify({ require: { 'monolog/monolog': '^2.0' } })
      );

      const result = await detector.detect(tempDir);

      expect(result.types).toContain(ProjectType.PHP);
      expect(result.analysis.language).toBe('PHP');
    });
  });

  describe('React Detection', () => {
    it('should detect React project', async () => {
      await fs.writeFile(
        path.join(tempDir, 'package.json'),
        JSON.stringify({
          dependencies: { react: '^18.0.0', 'react-dom': '^18.0.0' },
        })
      );

      const result = await detector.detect(tempDir);

      expect(result.types).toContain(ProjectType.REACT);
      expect(result.primaryType).toBe(ProjectType.REACT);
      expect(result.analysis.language).toBe('JavaScript/TypeScript');
      expect(result.analysis.framework).toBe('React');
    });

    it('should detect React with npm', async () => {
      await fs.writeFile(
        path.join(tempDir, 'package.json'),
        JSON.stringify({ dependencies: { react: '^18.0.0' } })
      );
      await fs.writeFile(path.join(tempDir, 'package-lock.json'), '{}');

      const result = await detector.detect(tempDir);

      expect(result.types).toContain(ProjectType.REACT);
      expect(result.analysis.packageManager).toBe('npm');
    });

    it('should detect React with pnpm', async () => {
      await fs.writeFile(
        path.join(tempDir, 'package.json'),
        JSON.stringify({ dependencies: { react: '^18.0.0' } })
      );
      await fs.writeFile(path.join(tempDir, 'pnpm-lock.yaml'), '');

      const result = await detector.detect(tempDir);

      expect(result.types).toContain(ProjectType.REACT);
      expect(result.analysis.packageManager).toBe('pnpm');
    });
  });

  describe('Vue Detection', () => {
    it('should detect Vue project', async () => {
      await fs.writeFile(
        path.join(tempDir, 'package.json'),
        JSON.stringify({ dependencies: { vue: '^3.0.0' } })
      );

      const result = await detector.detect(tempDir);

      expect(result.types).toContain(ProjectType.VUE);
      expect(result.analysis.framework).toBe('Vue');
    });
  });

  describe('Next.js Detection', () => {
    it('should detect Next.js project', async () => {
      await fs.writeFile(
        path.join(tempDir, 'package.json'),
        JSON.stringify({ dependencies: { next: '^14.0.0', react: '^18.0.0' } })
      );

      const result = await detector.detect(tempDir);

      expect(result.types).toContain(ProjectType.NEXTJS);
      expect(result.analysis.framework).toBe('Next.js');
    });
  });

  describe('Python Detection', () => {
    it('should detect Django project', async () => {
      await fs.writeFile(path.join(tempDir, 'requirements.txt'), 'django==4.2');
      await fs.writeFile(path.join(tempDir, 'manage.py'), '#!/usr/bin/env python');

      const result = await detector.detect(tempDir);

      expect(result.types).toContain(ProjectType.DJANGO);
      expect(result.analysis.framework).toBe('Django');
    });

    it('should detect Flask project', async () => {
      await fs.writeFile(path.join(tempDir, 'requirements.txt'), 'flask==3.0');
      await fs.writeFile(path.join(tempDir, 'app.py'), 'from flask import Flask');

      const result = await detector.detect(tempDir);

      expect(result.types).toContain(ProjectType.FLASK);
      expect(result.analysis.framework).toBe('Flask');
    });

    it('should detect generic Python project', async () => {
      await fs.writeFile(path.join(tempDir, 'pyproject.toml'), '[project]\nname = "test"');

      const result = await detector.detect(tempDir);

      expect(result.types).toContain(ProjectType.PYTHON);
    });
  });

  describe('Ruby Detection', () => {
    it('should detect Rails project', async () => {
      await fs.writeFile(path.join(tempDir, 'Gemfile'), "gem 'rails'");
      await fs.writeFile(path.join(tempDir, 'config.ru'), 'run Rails.app');

      const result = await detector.detect(tempDir);

      expect(result.types).toContain(ProjectType.RAILS);
      expect(result.analysis.framework).toBe('Rails');
    });

    it('should detect generic Ruby project', async () => {
      await fs.writeFile(path.join(tempDir, 'Gemfile'), "gem 'sinatra'");

      const result = await detector.detect(tempDir);

      expect(result.types).toContain(ProjectType.RUBY);
    });
  });

  describe('Android Detection', () => {
    it('should detect Android project', async () => {
      await fs.writeFile(path.join(tempDir, 'gradlew'), '#!/bin/bash');
      await fs.writeFile(path.join(tempDir, 'settings.gradle'), 'include ":app"');

      const result = await detector.detect(tempDir);

      expect(result.types).toContain(ProjectType.ANDROID);
      expect(result.analysis.framework).toBe('Android/Gradle');
    });

    it('should detect Android project with build.gradle.kts', async () => {
      await fs.writeFile(path.join(tempDir, 'gradlew'), '#!/bin/bash');
      await fs.writeFile(path.join(tempDir, 'build.gradle.kts'), 'plugins { kotlin-android }');
      await fs.writeFile(path.join(tempDir, 'settings.gradle.kts'), 'include ":app"');

      const result = await detector.detect(tempDir);

      expect(result.types).toContain(ProjectType.ANDROID);
    });
  });

  describe('Go Detection', () => {
    it('should detect Go project', async () => {
      await fs.writeFile(path.join(tempDir, 'go.mod'), 'module example.com/test');

      const result = await detector.detect(tempDir);

      expect(result.types).toContain(ProjectType.GO);
      expect(result.analysis.language).toBe('Go');
    });
  });

  describe('Rust Detection', () => {
    it('should detect Rust project', async () => {
      await fs.writeFile(
        path.join(tempDir, 'Cargo.toml'),
        '[package]\nname = "test"\nversion = "0.1.0"'
      );

      const result = await detector.detect(tempDir);

      expect(result.types).toContain(ProjectType.RUST);
      expect(result.analysis.language).toBe('Rust');
    });
  });

  describe('Mixed Projects', () => {
    it('should detect Laravel + React (Inertia)', async () => {
      // Laravel indicators
      await fs.writeFile(
        path.join(tempDir, 'composer.json'),
        JSON.stringify({ require: { 'laravel/framework': '^10.0' } })
      );
      await fs.writeFile(path.join(tempDir, 'artisan'), '#!/usr/bin/env php');

      // React indicators
      await fs.writeFile(
        path.join(tempDir, 'package.json'),
        JSON.stringify({ dependencies: { react: '^18.0.0' } })
      );

      const result = await detector.detect(tempDir);

      expect(result.types).toContain(ProjectType.LARAVEL);
      expect(result.types).toContain(ProjectType.REACT);
      expect(result.types.length).toBeGreaterThan(1);
    });

    it('should detect multiple Node frameworks (Next.js takes priority)', async () => {
      await fs.writeFile(
        path.join(tempDir, 'package.json'),
        JSON.stringify({ dependencies: { next: '^14.0.0', react: '^18.0.0' } })
      );

      const result = await detector.detect(tempDir);

      // Next.js is more specific, so it should be detected
      expect(result.types).toContain(ProjectType.NEXTJS);
    });
  });

  describe('Unknown Projects', () => {
    it('should return UNKNOWN for empty directory', async () => {
      const result = await detector.detect(tempDir);

      expect(result.types).toContain(ProjectType.UNKNOWN);
      expect(result.primaryType).toBe(ProjectType.UNKNOWN);
    });

    it('should return UNKNOWN for directory with no indicators', async () => {
      await fs.writeFile(path.join(tempDir, 'README.md'), '# Hello World');

      const result = await detector.detect(tempDir);

      expect(result.types).toContain(ProjectType.UNKNOWN);
    });
  });
});
