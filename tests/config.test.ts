import { toggleFeature, features } from '../src/config';

describe('config', () => {
  describe('toggleFeature', () => {
    let consoleSpy: jest.SpyInstance;

    beforeEach(() => {
      consoleSpy = jest.spyOn(console, 'warn').mockImplementation();
    });

    afterEach(() => {
      consoleSpy.mockRestore();
    });

    it('should return false and log a warning if the feature does not exist', () => {
      const featureName = 'nonExistentFeature';

      const result = toggleFeature(featureName);

      expect(result).toBe(false);
      expect(consoleSpy).toHaveBeenCalledWith(`Feature flag '${featureName}' does not exist`);
    });

    it('should toggle the feature state if no enabled value is provided', () => {
      const featureName = 'testFeature';
      features[featureName] = {
        enabled: false,
        defaultValue: false,
        description: 'Test feature',
      };

      try {
        const result = toggleFeature(featureName);

        expect(result).toBe(true);
        expect(features[featureName].enabled).toBe(true);

        const secondResult = toggleFeature(featureName);
        expect(secondResult).toBe(false);
        expect(features[featureName].enabled).toBe(false);
      } finally {
        delete features[featureName];
      }
    });

    it('should set the feature state to the provided value', () => {
      const featureName = 'testFeatureExplicit';
      features[featureName] = {
        enabled: false,
        defaultValue: false,
        description: 'Test feature',
      };

      try {
        const result = toggleFeature(featureName, true);

        expect(result).toBe(true);
        expect(features[featureName].enabled).toBe(true);

        const secondResult = toggleFeature(featureName, true);
        expect(secondResult).toBe(true);
        expect(features[featureName].enabled).toBe(true);

        const thirdResult = toggleFeature(featureName, false);
        expect(thirdResult).toBe(false);
        expect(features[featureName].enabled).toBe(false);
      } finally {
        delete features[featureName];
      }
    });
  });
});
