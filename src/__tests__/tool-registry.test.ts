import {
  getToolsForProjectTypes,
  PROJECT_TOOL_MAPPING,
  UNIVERSAL_TOOLS,
  isUniversalTool,
} from '../registration/tool-registry.js';
import { ProjectType } from '../detection/project-types.js';
import { ToolCategory } from '../types/registration.js';

describe('Tool Registry', () => {
  describe('Universal Tools', () => {
    it('should include all expected universal tools', () => {
      expect(UNIVERSAL_TOOLS).toContain(ToolCategory.FILESYSTEM);
      expect(UNIVERSAL_TOOLS).toContain(ToolCategory.GIT);
      expect(UNIVERSAL_TOOLS).toContain(ToolCategory.PROJECT);
      expect(UNIVERSAL_TOOLS).toContain(ToolCategory.TASKS);
      expect(UNIVERSAL_TOOLS).toContain(ToolCategory.IMAGES);
      expect(UNIVERSAL_TOOLS).toContain(ToolCategory.WEB);
    });

    it('should not include specialized tools as universal', () => {
      expect(UNIVERSAL_TOOLS).not.toContain(ToolCategory.FORMATTING);
      expect(UNIVERSAL_TOOLS).not.toContain(ToolCategory.PACKAGE_MANAGER);
      expect(UNIVERSAL_TOOLS).not.toContain(ToolCategory.ML);
      expect(UNIVERSAL_TOOLS).not.toContain(ToolCategory.ANDROID);
      expect(UNIVERSAL_TOOLS).not.toContain(ToolCategory.COMMANDS);
    });

    it('should correctly identify universal tools', () => {
      expect(isUniversalTool(ToolCategory.FILESYSTEM)).toBe(true);
      expect(isUniversalTool(ToolCategory.GIT)).toBe(true);
      expect(isUniversalTool(ToolCategory.PROJECT)).toBe(true);
      expect(isUniversalTool(ToolCategory.TASKS)).toBe(true);
      expect(isUniversalTool(ToolCategory.IMAGES)).toBe(true);
      expect(isUniversalTool(ToolCategory.WEB)).toBe(true);
    });

    it('should not identify specialized tools as universal', () => {
      expect(isUniversalTool(ToolCategory.FORMATTING)).toBe(false);
      expect(isUniversalTool(ToolCategory.PACKAGE_MANAGER)).toBe(false);
      expect(isUniversalTool(ToolCategory.ML)).toBe(false);
      expect(isUniversalTool(ToolCategory.ANDROID)).toBe(false);
    });
  });

  describe('Project Tool Mapping', () => {
    it('should map Laravel to correct tools', () => {
      const tools = PROJECT_TOOL_MAPPING[ProjectType.LARAVEL];
      expect(tools).toContain(ToolCategory.PACKAGE_MANAGER);
      expect(tools).toContain(ToolCategory.FORMATTING);
    });

    it('should map React to correct tools', () => {
      const tools = PROJECT_TOOL_MAPPING[ProjectType.REACT];
      expect(tools).toContain(ToolCategory.PACKAGE_MANAGER);
      expect(tools).toContain(ToolCategory.FORMATTING);
    });

    it('should map Android to correct tools', () => {
      const tools = PROJECT_TOOL_MAPPING[ProjectType.ANDROID];
      expect(tools).toContain(ToolCategory.ANDROID);
      expect(tools).toContain(ToolCategory.PACKAGE_MANAGER);
      expect(tools).toContain(ToolCategory.FORMATTING);
    });

    it('should map Django to correct tools including ML', () => {
      const tools = PROJECT_TOOL_MAPPING[ProjectType.DJANGO];
      expect(tools).toContain(ToolCategory.PACKAGE_MANAGER);
      expect(tools).toContain(ToolCategory.FORMATTING);
      expect(tools).toContain(ToolCategory.ML);
    });

    it('should map Go to correct tools', () => {
      const tools = PROJECT_TOOL_MAPPING[ProjectType.GO];
      expect(tools).toContain(ToolCategory.PACKAGE_MANAGER);
      expect(tools).toContain(ToolCategory.FORMATTING);
    });

    it('should map Rust to correct tools', () => {
      const tools = PROJECT_TOOL_MAPPING[ProjectType.RUST];
      expect(tools).toContain(ToolCategory.PACKAGE_MANAGER);
      expect(tools).toContain(ToolCategory.FORMATTING);
    });

    it('should have no specialized tools for UNKNOWN', () => {
      const tools = PROJECT_TOOL_MAPPING[ProjectType.UNKNOWN];
      expect(tools).toEqual([]);
    });
  });

  describe('getToolsForProjectTypes', () => {
    it('should always include universal tools', () => {
      const tools = getToolsForProjectTypes([ProjectType.UNKNOWN]);

      UNIVERSAL_TOOLS.forEach((universalTool) => {
        expect(tools).toContain(universalTool);
      });
    });

    it('should add specialized tools for Laravel', () => {
      const tools = getToolsForProjectTypes([ProjectType.LARAVEL]);

      expect(tools).toContain(ToolCategory.PACKAGE_MANAGER);
      expect(tools).toContain(ToolCategory.FORMATTING);
    });

    it('should add specialized tools for React', () => {
      const tools = getToolsForProjectTypes([ProjectType.REACT]);

      expect(tools).toContain(ToolCategory.PACKAGE_MANAGER);
      expect(tools).toContain(ToolCategory.FORMATTING);
    });

    it('should add specialized tools for Android', () => {
      const tools = getToolsForProjectTypes([ProjectType.ANDROID]);

      expect(tools).toContain(ToolCategory.ANDROID);
    });

    it('should combine tools for mixed projects (Laravel + React)', () => {
      const tools = getToolsForProjectTypes([ProjectType.LARAVEL, ProjectType.REACT]);

      // Universal tools should be present
      expect(tools).toContain(ToolCategory.FILESYSTEM);
      expect(tools).toContain(ToolCategory.GIT);

      // Laravel tools
      expect(tools).toContain(ToolCategory.PACKAGE_MANAGER);
      expect(tools).toContain(ToolCategory.FORMATTING);

      // React tools (same categories as Laravel, should not duplicate)
      expect(tools.filter((t) => t === ToolCategory.PACKAGE_MANAGER)).toHaveLength(1);
    });

    it('should add ML tools for Python projects', () => {
      const djangoTools = getToolsForProjectTypes([ProjectType.DJANGO]);
      const flaskTools = getToolsForProjectTypes([ProjectType.FLASK]);
      const pythonTools = getToolsForProjectTypes([ProjectType.PYTHON]);

      expect(djangoTools).toContain(ToolCategory.ML);
      expect(flaskTools).toContain(ToolCategory.ML);
      expect(pythonTools).toContain(ToolCategory.ML);
    });

    it('should return unique tools (no duplicates)', () => {
      const tools = getToolsForProjectTypes([
        ProjectType.LARAVEL,
        ProjectType.REACT,
        ProjectType.VUE,
        ProjectType.NEXTJS,
      ]);

      // Check that there are no duplicates
      const uniqueTools = new Set(tools);
      expect(tools.length).toBe(uniqueTools.size);
    });

    it('should handle empty types array gracefully', () => {
      const tools = getToolsForProjectTypes([]);

      // Should still have universal tools
      expect(tools.length).toBeGreaterThan(0);
    });
  });
});
