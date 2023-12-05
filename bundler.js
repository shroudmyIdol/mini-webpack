const fs = require("fs");
const path = require("path");
const parser = require("@babel/parser");
const traverse = require("@babel/traverse").default;
const babel = require("@babel/core");

// 转成AST抽象语法树
// 返回入口文件的路径、es5code、依赖
const moduleAnalyser = (fileName) => {
  const fileContent = fs.readFileSync(fileName, "utf-8");

  const ast = parser.parse(fileContent, { sourceType: "module" });

  const dependencies = {};

  traverse(ast, {
    ImportDeclaration({ node }) {
      const dirname = path.dirname(fileName);
      const newFile = "./" + path.join(dirname, node.source.value);

      dependencies[node.source.value] = newFile.replace(/\\/g, "/");
    },
  });

  const { code } = babel.transformFromAst(ast, null, {
    presets: ["@babel/preset-env"],
  });

  return { fileName, code, dependencies };
};

// 递归构造依赖的图谱
// { [fileName] = { dependencies, code } }
const makeDependenciesGraph = (entry) => {
  const entryModule = moduleAnalyser(entry);

  const graphArray = [entryModule];

  for (let i = 0; i < graphArray.length; i++) {
    const item = graphArray[i];

    const dependencies = item.dependencies;

    if (dependencies) {
      for (let key in dependencies) {
        const result = moduleAnalyser(dependencies[key]);
        graphArray.push(result);
      }
    }
  }

  const graph = {};

  graphArray.forEach((item) => {
    const { fileName, dependencies, code } = item;
    graph[fileName] = { dependencies, code };
  });

  return graph;
};

// 初始化成为浏览器可以运行的code
// IIFE立执行函数，形成闭包独立作用域
const generateCode = (entry) => {
  const graphInfo = makeDependenciesGraph(entry);

  return `
    (function (graph) {
        function require(module) {
            function localRequire(relativePath) {
                return require(graph[module].dependencies[relativePath])
            };

            var exports = {};

            (function (require, exports, code) {
                eval(code);
            })(localRequire, exports, graph[module].code);

            return exports;
        };

        require('${entry}');
    })(${JSON.stringify(graphInfo)})
  `;
};

const code = generateCode("./src/index.js");

console.log(code);
