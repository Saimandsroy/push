// Edge Runtime Polyfill for AWS SDK v3
// This fixes the "DOMParser is not defined" error when using AWS SDK in Edge runtime
// The AWS SDK's XML parser expects browser APIs that aren't available in Edge/Workers

// Minimal DOMParser polyfill for AWS SDK XML parsing
if (typeof DOMParser === 'undefined') {
  // @ts-ignore
  globalThis.DOMParser = class DOMParser {
    parseFromString(xmlString: string, mimeType: string) {
      // Simple XML-to-object parser for AWS SDK responses
      // AWS SDK primarily needs this for S3 error responses and metadata
      const doc = {
        documentElement: {
          getElementsByTagName: (tagName: string) => {
            const regex = new RegExp(`<${tagName}[^>]*>([^<]*)<\/${tagName}>`, 'gi');
            const matches = [];
            let match;
            while ((match = regex.exec(xmlString)) !== null) {
              matches.push({
                textContent: match[1],
                getAttribute: () => null,
              });
            }
            return matches;
          },
          getAttribute: () => null,
          textContent: xmlString,
        },
        getElementsByTagName: function(tagName: string) {
          return this.documentElement.getElementsByTagName(tagName);
        },
      };
      return doc;
    }
  };
}

export {};
