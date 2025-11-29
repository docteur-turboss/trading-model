import { LogLevel, Logger } from "../../common/config/logger";
// disable no-explicit-any on all file for testing private methods
/* eslint-disable @typescript-eslint/no-explicit-any */

// Mock fetch for testing purposes
global.fetch = jest.fn();

describe('Logger.ts', () => {
    let logger: Logger;

    const originalEnv = process.env;

    beforeEach(() => {
        jest.useFakeTimers().setSystemTime(new Date("2024-01-01T00:00:00Z"));

        process.env = { ...originalEnv};
        (global.fetch as jest.Mock).mockClear();

        logger = new Logger(LogLevel.DEBUG);

        jest.spyOn(console, "debug").mockImplementation(() => {});
        jest.spyOn(console, "info").mockImplementation(() => {});
        jest.spyOn(console, "warn").mockImplementation(() => {});
        jest.spyOn(console, "error").mockImplementation(() => {});
    })

    afterEach(() => {
        jest.restoreAllMocks();
        jest.useRealTimers();
        process.env = originalEnv;
    })

    /* ------------------------------------------------- */
    /* ------                                     ------ */
    /* ------             SESSION ID              ------ */
    /* ------                                     ------ */
    /* ------------------------------------------------- */
    test('generatesSessionId should generate a properly formatted session ID', () => {
        const sessionId = (logger as any).generateSessionId();

        expect(sessionId).toMatch(/^2024\.1\.1-0_[a-z0-9]{8}$/)
    });

    /* ------------------------------------------------- */
    /* ------                                     ------ */
    /* ------             LOG LEVELS              ------ */
    /* ------                                     ------ */
    /* ------------------------------------------------- */
    test('shouldLog should filter logs based on log level', () => {
        const shouldLog = (logger as any).shouldLog.bind(logger);

        expect(shouldLog(LogLevel.DEBUG)).toBe(true);
        logger = new Logger(LogLevel.WARN);
        expect((logger as any).shouldLog(LogLevel.INFO)).toBe(false);
        expect((logger as any).shouldLog(LogLevel.ERROR)).toBe(true);
    });

    /* ------------------------------------------------- */
    /* ------                                     ------ */
    /* ------           BUFFER BEHAVIOR           ------ */
    /* ------                                     ------ */
    /* ------------------------------------------------- */
    test('addToBuffer should push log and keep size below maxLogs', () => {
        const addToBuffer = (logger as any).addToBuffer.bind(logger);

        for (let i = 0; i < 1100; i++) {
            addToBuffer({
                timeStamp: new Date(),
                level: LogLevel.INFO,
                message: `log-${i}`,
            })
        }

        expect(logger.getLogs().length).toBe(1000); // maxLogs is by default 1000
        expect(logger.getLogs()[0].message).toBe('log-100'); // The shift worked
    })

    /* ------------------------------------------------- */
    /* ------                                     ------ */
    /* ------ PUBLIC METHOD DEBUG/INFO/WARN/ERROR ------ */
    /* ------                                     ------ */
    /* ------------------------------------------------- */
    test("debug should log when level >= logLevel", () => {
        logger.debug('test-debug', { a: 1 });

        expect(console.debug).toHaveBeenCalledTimes(1);
        const logs = logger.getLogs();
        expect(logs.length).toBe(1);
        expect(logs[0].message).toBe('test-debug');
        expect(logs[0].context).toEqual({ a: 1 });
    });

    test('info should log and add entry', () => {
        logger = new Logger(LogLevel.INFO);
        logger.info('test-info');

        expect(console.info).toHaveBeenCalledTimes(1);
        expect(logger.getLogs().length).toBe(1);
    });

    test('warn should log with WARN level', () => {
        logger.warn('test-warn');

        expect(console.warn).toHaveBeenCalledTimes(1);
        expect(logger.getLogs()[0].level).toBe(LogLevel.WARN);
    });

    test('error should log with ERROR level', () => {
        logger.error('test-error', { x: 42 });

        expect(console.error).toHaveBeenCalledTimes(1);
        const entry = logger.getLogs()[0];
        expect(entry.level).toBe(LogLevel.ERROR);
        expect(entry.context).toEqual({ x: 42 });
    });

    /* ------------------------------------------------- */
    /* ------                                     ------ */
    /* ------      Send to the error service      ------ */
    /* ------                                     ------ */
    /* ------------------------------------------------- */
    test('error should call sendToErrorService only in production or staging', async () => {
        process.env.NODE_ENV = 'production';

        logger = new Logger(LogLevel.DEBUG);

        logger.error('prod-error');

        expect(global.fetch).toHaveBeenCalledTimes(1);

        const body = JSON.parse((global.fetch as jest.Mock).mock.calls[0][1].body);
        expect(body.message).toBe('prod-error');
    });

    test('error should not call sendToErrorService in development', () => {
        process.env.NODE_ENV = 'development';

        logger.error('dev-error');

        expect(global.fetch).not.toHaveBeenCalled();
    });

    /* ------------------------------------------------- */
    /* ------                                     ------ */
    /* ------   Instance export accorded to env   ------ */
    /* ------                                     ------ */
    /* ------------------------------------------------- */
    test('exported logger should have level DEBUG in development', () => {
        process.env.NODE_ENV = 'development';
        const l = new Logger(
            process.env.NODE_ENV === 'development' ? LogLevel.DEBUG : process.env.NODE_ENV === 'staging' ? LogLevel.INFO : LogLevel.WARN
        );

        expect((l as any).logLevel).toBe(LogLevel.DEBUG);
    });

    test('exported logger should use WARN by default', () => {
        process.env.NODE_ENV = 'production';
        const l = new Logger(
            process.env.NODE_ENV === 'development' ? LogLevel.DEBUG : process.env.NODE_ENV === 'staging' ? LogLevel.INFO : LogLevel.WARN
        );;

        expect((l as any).logLevel).toBe(LogLevel.WARN);
    });
});