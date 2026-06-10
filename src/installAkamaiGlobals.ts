import { installFetchPolyfill } from './akamaiFetchPolyfill'
import { installStreamsPolyfill } from './akamaiStreamsPolyfill'
import { installTextEncodingPolyfill } from './akamaiTextEncodingPolyfill'
import { installUrlPolyfill } from './akamaiUrlPolyfill'

// Akamai EdgeWorkers lacks standard Web Platform globals that @monetizationos/proxy expects.
// Install before any proxy code runs. Streams/text encoding first — fetch polyfill uses them.
installStreamsPolyfill()
installTextEncodingPolyfill()
installUrlPolyfill()
installFetchPolyfill()
