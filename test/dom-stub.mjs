// world.js 가 draw/ 를 통해 캔버스를 건드린다. 물리만 시험하려고 최소한만 흉내 낸다.
const ctxStub = new Proxy({}, {
  get: (_, key) => {
    if (key === 'canvas') return { width: 1, height: 1 };
    if (key === 'measureText') return () => ({ width: 10 });
    if (key === 'getImageData') return () => ({ data: new Uint8ClampedArray(4) });
    return () => {};
  },
  set: () => true,
});
globalThis.document = {
  createElement: () => ({ width: 0, height: 0, getContext: () => ctxStub, style: {} }),
  getElementById: () => ({ getContext: () => ctxStub, style: {} }),
};
globalThis.window = { devicePixelRatio: 2, addEventListener() {}, innerWidth: 1512, innerHeight: 982 };
globalThis.requestAnimationFrame = () => 0;
