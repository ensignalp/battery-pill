// gjs -m tests/stateResolver.test.js
import {resolve, UpState} from '../lib/stateResolver.js';

let failed = 0;
function eq(name, actual, expected) {
    const a = JSON.stringify(actual), e = JSON.stringify(expected);
    if (a !== e) {
        failed++;
        print(`FAIL ${name}\n  got      ${a}\n  expected ${e}`);
    }
}

const D = UpState.DISCHARGING, C = UpState.CHARGING;
const bat = (percent, state) => ({present: true, percent, state});

// Full priority matrix: charging × low × saver
eq('normal', resolve(bat(50, D), 'balanced'), {visible: true, tone: 'normal', level: 50, bolt: false});
eq('saver', resolve(bat(50, D), 'power-saver').tone, 'saver');
eq('low', resolve(bat(12, D), 'balanced').tone, 'low');
eq('low beats saver', resolve(bat(12, D), 'power-saver').tone, 'low');
eq('charging', resolve(bat(50, C), 'balanced'), {visible: true, tone: 'charging', level: 50, bolt: true});
eq('charging beats saver', resolve(bat(50, C), 'power-saver').tone, 'charging');
eq('charging beats low', resolve(bat(10, C), 'balanced').tone, 'charging');
eq('charging beats all', resolve(bat(10, C), 'power-saver').tone, 'charging');

// Plugged-in states
eq('fully charged = green+bolt', resolve(bat(100, UpState.FULLY_CHARGED), null), {visible: true, tone: 'charging', level: 100, bolt: true});
eq('pending charge = green+bolt', resolve(bat(80, UpState.PENDING_CHARGE), null).bolt, true);
eq('pending discharge not charging', resolve(bat(80, UpState.PENDING_DISCHARGE), null).tone, 'normal');

// Threshold edges and rounding
eq('15 is low', resolve(bat(15, D), null).tone, 'low');
eq('16 not low', resolve(bat(16, D), null).tone, 'normal');
eq('15.4 rounds to 15 → low', resolve(bat(15.4, D), null).tone, 'low');
eq('15.5 rounds to 16 → normal', resolve(bat(15.5, D), null).tone, 'normal');
eq('custom threshold', resolve(bat(20, D), null, {lowThreshold: 20}).tone, 'low');
eq('clamp', resolve(bat(104, D), null).level, 100);

// No battery / unknown
eq('no battery', resolve({present: false, percent: 0, state: 0}, null), {visible: false});
eq('null battery', resolve(null, 'power-saver'), {visible: false});
eq('null profile', resolve(bat(50, D), null).tone, 'normal');

print(failed ? `${failed} failed` : 'stateResolver: all passed');
if (failed)
    imports.system.exit(1);
