// Global singleton manager to prevent duplicate API calls across the entire application
// This ensures that even if multiple components try to make the same API call,
// only one actually executes and others wait for the result

interface GlobalSingletons {
  __SHOP_STATUS_PROMISE__?: Promise<boolean> | null;
  __SESSION_INIT_PROMISE__?: Promise<void> | null;
  __SESSION_CREATE_PROMISE__?: Promise<any> | null;
  __SESSION_VALIDATE_PROMISES__?: Record<string, Promise<any> | null>;
  __SHOP_OPEN__?: boolean;
  __SESSION_INITIALIZED__?: boolean;
}

declare global {
  interface Window extends GlobalSingletons {}
}

// Shop Status Singleton
export const ShopStatusManager = {
  getPromise(): Promise<boolean> | null {
    if (typeof window === 'undefined') return null;
    return window.__SHOP_STATUS_PROMISE__ || null;
  },

  setPromise(promise: Promise<boolean> | null) {
    if (typeof window !== 'undefined') {
      window.__SHOP_STATUS_PROMISE__ = promise;
    }
  },

  isShopOpen(): boolean {
    if (typeof window === 'undefined') return false;
    return !!window.__SHOP_OPEN__;
  },

  setShopOpen(isOpen: boolean) {
    if (typeof window !== 'undefined') {
      window.__SHOP_OPEN__ = isOpen;
      if (isOpen) {
        window.dispatchEvent(new CustomEvent('shop-status-open'));
      }
    }
  }
};

// Session Initialization Singleton
export const SessionInitManager = {
  getPromise(): Promise<void> | null {
    if (typeof window === 'undefined') return null;
    return window.__SESSION_INIT_PROMISE__ || null;
  },

  setPromise(promise: Promise<void> | null) {
    if (typeof window !== 'undefined') {
      window.__SESSION_INIT_PROMISE__ = promise;
    }
  },

  getInitialized(): boolean {
    if (typeof window === 'undefined') return false;
    return !!window.__SESSION_INITIALIZED__;
  },

  setInitialized(val: boolean) {
    if (typeof window !== 'undefined') {
      window.__SESSION_INITIALIZED__ = val;
    }
  }
};

// Session Creation Singleton
export const SessionCreateManager = {
  getPromise(): Promise<any> | null {
    if (typeof window === 'undefined') return null;
    return window.__SESSION_CREATE_PROMISE__ || null;
  },

  setPromise(promise: Promise<any> | null) {
    if (typeof window !== 'undefined') {
      window.__SESSION_CREATE_PROMISE__ = promise;
    }
  }
};

// Session Validation Singleton
export const SessionValidateManager = {
  getPromise(customerUUID: string): Promise<any> | null {
    if (typeof window === 'undefined') return null;
    if (!window.__SESSION_VALIDATE_PROMISES__) {
      window.__SESSION_VALIDATE_PROMISES__ = {};
    }
    return window.__SESSION_VALIDATE_PROMISES__[`validate:${customerUUID}`] || null;
  },

  setPromise(customerUUID: string, promise: Promise<any> | null) {
    if (typeof window !== 'undefined') {
      if (!window.__SESSION_VALIDATE_PROMISES__) {
        window.__SESSION_VALIDATE_PROMISES__ = {};
      }
      window.__SESSION_VALIDATE_PROMISES__[`validate:${customerUUID}`] = promise;
    }
  }
};
