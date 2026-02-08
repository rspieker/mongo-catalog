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
];

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
    const instance = await selected.create(dsn);
    
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
