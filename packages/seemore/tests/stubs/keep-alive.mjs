// Holds the event loop open, as an Electron utility process does after its script finishes
// (electron/electron#47228). A CLI command that relies on the loop draining never exits here.
setInterval(() => {}, 1 << 30);
