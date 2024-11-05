// Импортируем необходимые модули
const fs = require('fs'); // Модуль для работы с файловой системой
const axios = require('axios'); // Библиотека для выполнения HTTP-запросов
const { exec } = require('child_process'); // Модуль для выполнения команд в командной строке
const {
    readConfig,
    getDependencies,
    generateDotGraph,
    generateImageFromDot,
} = require('./index'); // Импортируем функции из основного модуля

// Мокаем модули для тестов
// Мокать - это процесс подмены реальных зависимостей, чтобы контролировать их поведение в тестах
jest.mock('fs'); // Мокаем fs для замены его функций в тестах
jest.mock('axios'); // Мокаем axios для подмены HTTP-запросов
jest.mock('child_process'); // Мокаем child_process для тестирования exec без реальных команд

// Группируем тесты под названием 'Dependency Visualizer'
describe('Dependency Visualizer', () => {

    // Очищаем все моки после каждого теста, чтобы избежать влияния на другие тесты
    afterEach(() => {
        jest.clearAllMocks();
    });

    // Тест для функции readConfig, проверяющий, что конфигурационный файл читается правильно
    test('readConfig should read the configuration file correctly', async () => {
        // Задаем тестовые данные, которые будут эмулировать данные конфигурационного файла
        const mockData = 'visualizerPath,packageName,outputFilePath,maxDepth,repositoryUrl\n'
            + 'dot,example-package,output.dot,2,https://api.example.com\n';
        
        // Создаем мок для симуляции чтения потока данных из CSV-файла
        const mockStream = {
            pipe: jest.fn().mockReturnThis(),
            on: jest.fn((event, callback) => {
                if (event === 'data') {
                    callback({
                        visualizerPath: 'dot', // Новый параметр: путь к программе для визуализации графов
                        packageName: 'example-package',
                        outputFilePath: 'output.dot',
                        maxDepth: '2',
                        repositoryUrl: 'https://api.example.com'
                    });
                }
                if (event === 'end') {
                    callback(); // Вызываем callback для события "конец" (end)
                }
                return mockStream;
            }),
        };

        // Мокаем fs.createReadStream, чтобы вернуть наш мок-объект вместо реального потока
        fs.createReadStream.mockReturnValue(mockStream);

        // Выполняем тестируемую функцию
        const config = await readConfig('./config.csv');

        // Проверяем, что результат соответствует ожидаемым значениям
        expect(config).toEqual({
            visualizerPath: 'dot', // Проверяем, что путь к программе визуализации тоже учитывается
            packageName: 'example-package',
            outputFilePath: 'output.dot',
            maxDepth: 2,
            repositoryUrl: 'https://api.example.com',
        });
    });

    // Тест для функции getDependencies, проверяющий рекурсивное получение зависимостей
    test('getDependencies should fetch dependencies recursively', async () => {
        // Мокаем ответ для запроса зависимостей первого уровня
        const mockResponse = {
            data: {
                dependencies: {
                    'dep1': {},
                    'dep2': {},
                },
            },
        };
        
        // Мокаем axios.get для возврата заранее определенного ответа при первом вызове
        axios.get.mockResolvedValueOnce(mockResponse);
        // Мокаем второй вызов для суб-зависимостей
        axios.get.mockResolvedValueOnce({ data: { dependencies: {} } });
        
        // Выполняем тестируемую функцию с параметрами
        const dependencies = await getDependencies('example-package', 1, 2, 'https://api.example.com');
        
        // Проверяем, что зависимости получены в правильном формате
        expect(dependencies).toEqual([
            { name: 'dep1', dependencies: [] },
            { name: 'dep2', dependencies: [] },
        ]);
    });

    // Тест для функции generateDotGraph, проверяющий генерацию строки DOT-графа
    test('generateDotGraph should create a valid DOT graph string', () => {
        // Создаем тестовые зависимости для проверки
        const dependencies = [
            { name: 'dep1', dependencies: [] },
            { name: 'dep2', dependencies: [] },
        ];
        
        // Выполняем функцию и генерируем граф в формате DOT
        const dotGraph = generateDotGraph(dependencies, 'example-package');
        
        // Проверяем, что строка графа содержит необходимые зависимости и название графа
        expect(dotGraph).toContain('digraph example-package');
        expect(dotGraph).toContain('"dep1"');
        expect(dotGraph).toContain('"dep2"');
    });

    // Тест для функции generateImageFromDot, проверяющий генерацию изображения из графа
    test('generateImageFromDot should handle image generation with specified visualizer path', async () => {
        const mockDotString = 'digraph example-package { }';
        const outputFilePath = 'output';
        const visualizerPath = 'customPathToDot'; // Путь к программе для визуализации графов

        // Мокаем fs.writeFileSync, чтобы предотвратить запись на диск в тесте
        fs.writeFileSync.mockImplementationOnce(() => {});
        
        // Мокаем exec для симуляции успешного выполнения команды
        exec.mockImplementation((command, callback) => {
            callback(null, '', ''); // Симулируем успешное выполнение команды
        });

        // Выполняем тестируемую функцию, передавая путь к программе для визуализации
        await generateImageFromDot(mockDotString, outputFilePath, visualizerPath);

        // Проверяем, что DOT-файл был записан и что exec был вызван с нужной командой и параметрами
        expect(fs.writeFileSync).toHaveBeenCalledWith(`${outputFilePath}.dot`, mockDotString, 'utf8');
        expect(exec).toHaveBeenCalledWith(`${visualizerPath} -Tsvg output.dot -o output.svg`, expect.any(Function));
        expect(exec).toHaveBeenCalledTimes(2); // Проверяем, что exec вызван дважды (для SVG и PNG)
    });
});
