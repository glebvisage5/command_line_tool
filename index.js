const fs = require('fs');
const csv = require('csv-parser');
const axios = require('axios');
const { exec } = require('child_process');

async function readConfig(filePath) {
    return new Promise((resolve, reject) => {
        const config = {};
        fs.createReadStream(filePath)
            .pipe(csv())
            .on('data', (row) => {
                config.visualizerPath = row.visualizerPath; // Новый параметр: путь к программе для визуализации графов
                config.packageName = row.packageName;
                config.outputFilePath = row.outputFilePath;
                config.maxDepth = parseInt(row.maxDepth, 10);
                config.repositoryUrl = row.repositoryUrl;
            })
            .on('end', () => resolve(config))
            .on('error', reject);
    });
}

async function getDependencies(packageName, depth, maxDepth, repositoryUrl) {
    if (depth > maxDepth) return [];

    try {
        const response = await axios.get(`${repositoryUrl}/${packageName}/latest`);
        const dependencies = response.data.dependencies || {};
        const result = [];

        for (const [name] of Object.entries(dependencies)) {
            const subDeps = await getDependencies(name, depth + 1, maxDepth, repositoryUrl);
            result.push({ name, dependencies: subDeps });
        }
        return result;
    } catch (error) {
        console.error(`Ошибка при загрузке зависимостей пакета ${packageName}:`, error.message);
        return [];
    }
}

function generateDotGraph(dependencies, packageName) {
    let graph = `digraph ${packageName} {\n`;

    function addDependencies(dep, parent) {
        graph += `  "${parent}" -> "${dep.name}";\n`;
        dep.dependencies.forEach((subDep) => addDependencies(subDep, dep.name));
    }

    dependencies.forEach((dep) => addDependencies(dep, packageName));
    graph += `}\n`;
    return graph;
}

async function generateImageFromDot(dotString, outputFilePath, visualizerPath = 'dot') {
    try {
        // Сохраняем DOT-граф в файл
        const dotFilePath = `${outputFilePath}.dot`;
        fs.writeFileSync(dotFilePath, dotString, 'utf8');
        console.log(`DOT-граф сохранен в: ${dotFilePath}`);

        // Используем указанный путь к программе для преобразования DOT в SVG
        const svgFilePath = `${outputFilePath}.svg`;
        const svgCommand = `${visualizerPath} -Tsvg ${dotFilePath} -o ${svgFilePath}`;

        // Выполняем команду через exec для SVG
        exec(svgCommand, (error, stdout, stderr) => {
            if (error) {
                console.error(`Ошибка при выполнении команды для SVG: ${error.message}`);
                return;
            }
            if (stderr) {
                console.error(`Ошибка: ${stderr}`);
                return;
            }
            console.log(`SVG-изображение графа сохранено в: ${svgFilePath}`);

            // Теперь преобразуем SVG в PNG
            const pngFilePath = `${outputFilePath}.png`;
            const pngCommand = `magick ${svgFilePath} ${pngFilePath}`;

            exec(pngCommand, (error, stdout, stderr) => {
                if (error) {
                    console.error(`Ошибка при выполнении команды для PNG: ${error.message}`);
                    return;
                }
                if (stderr) {
                    console.error(`Ошибка: ${stderr}`);
                    return;
                }
                console.log(`PNG-изображение графа сохранено в: ${pngFilePath}`);
            });
        });
    } catch (error) {
        console.error("Ошибка при генерации изображения:", error.message);
    }
}

(async function () {
    try {
        const config = await readConfig('./config.csv');
        const dependencies = await getDependencies(config.packageName, 1, config.maxDepth, config.repositoryUrl);
        
        if (dependencies.length === 0) {
            console.log("Не удалось получить зависимости или пакет не имеет зависимостей.");
            return;
        }

        const dotGraph = generateDotGraph(dependencies, config.packageName);
        fs.writeFileSync(config.outputFilePath, dotGraph);
        console.log("Граф зависимостей:\n", dotGraph);

        await generateImageFromDot(dotGraph, config.outputFilePath.replace('.dot', ''), config.visualizerPath);
    } catch (error) {
        console.error("Произошла ошибка:", error.message);
    }
})();

// Экспортируем функции
module.exports = {
    readConfig,
    getDependencies,
    generateDotGraph,
    generateImageFromDot,
};
