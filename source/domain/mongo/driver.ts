// MongoDB Driver Factory
// Selects appropriate driver version based on MongoDB version

import { DSN } from './dsn';
import { Version } from '../version';
import { CatalogDriver } from './driver/interface';

// Import all driver versions
import { createDriverV2 } from './driver/v2';
import { createDriverV3 } from './driver/v3';
import { createDriverV4 } from './driver/v4';
import { createDriverV5 } from './driver/v5';
import { createDriverV6 } from './driver/v6';
import { createDriverV7 } from './driver/v7';

type DriverOption = {
    create: (dsn: DSN) => Promise<CatalogDriver>;
    before: Version;  // Use this driver for versions BEFORE this version
};

// Driver selection based on MongoDB version
// Earlier versions in array = older MongoDB versions
const drivers: DriverOption[] = [
    { create: createDriverV2, before: new Version('3.0') },    // MongoDB < 3.0
    { create: createDriverV3, before: new Version('3.6') },    // MongoDB 3.0 - 3.5
    { create: createDriverV4, before: new Version('5.0') },    // MongoDB 3.6 - 4.4
    { create: createDriverV5, before: new Version('6.0') },    // MongoDB 5.0 - 5.x
    { create: createDriverV6, before: new Version('7.0') },    // MongoDB 6.0 - 6.x
    { create: createDriverV7, before: new Version('9.0') },    // MongoDB 7.0 - 8.x
];

// If the mongod process dies mid-operation (e.g. a server-side crash), the
// client is left waiting for a response that will never arrive — none of
// the driver implementations set connectTimeoutMS/socketTimeoutMS, so
// nothing bounds that wait. Wrapping every method here (once, generically,
// rather than in each of the 6 driver files) turns a stall into a real,
// thrown error from the outside, regardless of what's happening inside a
// given method's own internal try/catch. A thrown error (as opposed to
// execute() returning {success:false}) is deliberate: a timeout means we
// don't actually know what happened, which is different from a real
// MongoDB error worth recording as data — it should abort the in-progress
// catalog, not be recorded as a query result.
const OPERATION_TIMEOUT_MS = 60_000;

function withTimeout(instance: CatalogDriver, timeoutMs: number): CatalogDriver {
    function wrap<Args extends unknown[], R>(
        fn: (...args: Args) => Promise<R>,
        label: string
    ): (...args: Args) => Promise<R> {
        return (...args: Args) =>
            Promise.race([
                fn(...args),
                new Promise<R>((_, reject) =>
                    setTimeout(
                        () => reject(new Error(`${label} timed out after ${timeoutMs}ms`)),
                        timeoutMs
                    )
                ),
            ]);
    }

    return {
        connect: wrap(instance.connect.bind(instance), 'connect'),
        disconnect: wrap(instance.disconnect.bind(instance), 'disconnect'),
        initCollection: wrap(instance.initCollection.bind(instance), 'initCollection'),
        dropCollection: wrap(instance.dropCollection.bind(instance), 'dropCollection'),
        execute: wrap(instance.execute.bind(instance), 'execute'),
    };
}

export async function driver(dsn: DSN, version: Version): Promise<CatalogDriver> {
    // Find appropriate driver
    // We want the FIRST driver where version < driver.before
    // Or default to the last driver (newest)
    const selected = drivers
        .find(({ before }) => version < before) || drivers[drivers.length - 1];
    
    if (!selected) {
        throw new Error(`No driver available for MongoDB version ${version}`);
    }
    
    console.log(`[Driver Factory] Selected driver for MongoDB ${version}: v${drivers.indexOf(selected) + 2}`);
    
    // Create driver instance
    const instance = withTimeout(await selected.create(dsn), OPERATION_TIMEOUT_MS);
    
    // Connect with retry logic
    const maxRetries = 10;
    const retryDelay = 1000;
    
    for (let attempt = 1; attempt <= maxRetries; attempt++) {
        try {
            await instance.connect();
            return instance;
        } catch (error: any) {
            if (attempt === maxRetries) {
                throw new Error(
                    `Failed to connect to MongoDB ${version} after ${maxRetries} attempts: ${error.message}`
                );
            }
            console.log(`Connection attempt ${attempt}/${maxRetries} failed, retrying in ${retryDelay}ms...`);
            await new Promise(resolve => setTimeout(resolve, retryDelay));
        }
    }
    
    throw new Error('Unexpected error in driver connection');
}
