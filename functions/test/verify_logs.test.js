const admin = require('firebase-admin');
const fft = require('firebase-functions-test')();
const { logger } = require("firebase-functions");

// Mock logger to verify error calls
jest.spyOn(logger, 'error').mockImplementation(() => { });

// Mock Firestore interactions
const mockDb = {
    collection: jest.fn().mockReturnThis(),
    doc: jest.fn().mockReturnThis(),
    set: jest.fn(),
    update: jest.fn(),
    get: jest.fn()
};

// Mock admin.firestore() to return our mockDb
jest.spyOn(admin, 'app').mockReturnValue({
    firestore: () => mockDb,
});

// Mock Firestore Timestamp/FieldValue if needed
admin.firestore.FieldValue = {
    serverTimestamp: jest.fn().mockReturnValue('MOCK_TIMESTAMP')
};
admin.firestore.Timestamp = {
    fromDate: jest.fn(date => ({
        toDate: () => date,
        toMillis: () => date.getTime(),
        _seconds: date.getTime() / 1000,
        _nanoseconds: 0
    }))
};

// Import the function AFTER mocking dependencies
const myFunctions = require('../index');

describe('apiScrapeBatch Logging & TTL', () => {
    let oldEnv;

    beforeAll(() => {
        oldEnv = process.env;
        process.env.FIRECRAWL_API_KEY = 'test-key';
        process.env.GEMINI_API_KEY = 'test-key';
    });

    afterAll(() => {
        process.env = oldEnv;
        fft.cleanup();
    });

    beforeEach(() => {
        jest.clearAllMocks();
    });

    test('should set expireAt to approx 7 days in future', async () => {
        const wrapped = fft.wrap(myFunctions.apiScrapeBatch);
        const urls = ['https://example.com/listing1'];

        // Mock success flow to avoid actual network calls
        // We only care about the initial set() call for this test
        // But the function awaits fetch, so we must mock fetch global
        global.fetch = jest.fn(() =>
            Promise.resolve({
                json: () => Promise.resolve({ success: true, data: { markdown: 'test' } })
            })
        );

        // Mock extractPropertyData (internal logic, but we need it to not fail)
        // Since we can't easily mock internal function calls without rewiring, 
        // we'll rely on fetch mock returning valid data, BUT the strict "index.js" 
        // structure might be hard to partial mock.
        // A simpler approach for *this specific test* is to check the first db.set call
        // which happens BEFORE any fetch.

        // However, the function awaits the *whole* process. 
        // We will mock fetch to throw immediately after the first set, 
        // so we can inspect the set call without running the whole scraping logic.
        global.fetch = jest.fn(() => Promise.reject(new Error("Force Stop")));

        try {
            await wrapped({ data: { urls } });
        } catch (e) {
            // Expected error from our forced stop
        }

        // Verify expireAt in the first set() call
        // 7 days = 7 * 24 * 60 * 60 * 1000 = 604800000 ms
        const setCallArgs = mockDb.set.mock.calls[0][0];
        expect(setCallArgs).toBeDefined();
        expect(setCallArgs.expireAt).toBeDefined();

        // Since we mocked Timestamp.fromDate to return an object with toMillis()
        // We can check if that time is roughly now + 7 days
        const timestampObj = setCallArgs.expireAt;
        const timeVal = timestampObj.toMillis();
        const now = Date.now();
        const sevenDaysLater = now + 604800000;

        // Allow 5 seconds variance
        expect(Math.abs(timeVal - sevenDaysLater)).toBeLessThan(5000);
    });

    test('should log error to Cloud Logging on fetch failure', async () => {
        const wrapped = fft.wrap(myFunctions.apiScrapeBatch);
        const urls = ['https://example.com/fail'];
        const runId = 'test-run';

        // Mock fetch to fail generically
        const errorMsg = "Network Error";
        global.fetch = jest.fn(() => Promise.reject(new Error(errorMsg)));

        // Mock get() for updateItemStatus to work
        mockDb.get.mockResolvedValue({
            data: () => ({
                items: [{ index: 1, status: 'pending' }]
            })
        });

        // Run function
        const result = await wrapped({ data: { urls } });

        // Expected specific failure in result
        expect(result.failed).toBe(1);

        // Verify logger.error was called
        expect(logger.error).toHaveBeenCalledWith(
            expect.stringContaining(`Batch item failed: ${urls[0]}`),
            expect.objectContaining({
                error: errorMsg
            })
        );
    });
});
