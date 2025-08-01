## 构建与运行

在提交任何更改之前，通过运行完整的预检检查来验证更改至关重要。该命令将构建仓库、运行所有测试、检查类型错误并进行代码检查。

要运行完整的检查套件，请执行以下命令：

```bash
npm run preflight
```

这个单一命令可确保您的更改满足项目的所有质量要求。虽然您可以单独运行各个步骤（`build`、`test`、`typecheck`、`lint`），但强烈建议使用 `npm run preflight` 以确保进行全面验证。

## 编写测试

本项目使用 **Vitest** 作为主要测试框架。编写测试时，请尽量遵循现有模式。关键约定包括：

### 测试结构与框架

- **框架**：所有测试均使用 Vitest 编写（`describe`、`it`、`expect`、`vi`）。
- **文件位置**：测试文件（`*.test.ts` 用于逻辑，`*.test.tsx` 用于 React 组件）与被测试的源文件放在一起。
- **配置**：测试环境在 `vitest.config.ts` 文件中定义。
- **设置/清理**：使用 `beforeEach` 和 `afterEach`。通常在 `beforeEach` 中调用 `vi.resetAllMocks()`，在 `afterEach` 中调用 `vi.restoreAllMocks()`。

### 模拟（Vitest 中的 `vi`）

- **ES 模块**：使用 `vi.mock('module-name', async (importOriginal) => { ... })` 进行模拟。使用 `importOriginal` 进行选择性模拟。
  - _示例_：`vi.mock('os', async (importOriginal) => { const actual = await importOriginal(); return { ...actual, homedir: vi.fn() }; });`
- **模拟顺序**：对于影响模块级常量的关键依赖项（如 `os`、`fs`），请将 `vi.mock` 放在测试文件的**最顶部**，在其他导入之前。
- **提升**：如果模拟函数需要在 `vi.mock` 工厂中使用之前定义，请使用 `const myMock = vi.hoisted(() => vi.fn());`。
- **模拟函数**：使用 `vi.fn()` 创建。使用 `mockImplementation()`、`mockResolvedValue()` 或 `mockRejectedValue()` 定义行为。
- **间谍**：使用 `vi.spyOn(object, 'methodName')`。在 `afterEach` 中使用 `mockRestore()` 恢复间谍。

### 常见模拟模块

- **Node.js 内置模块**：`fs`、`fs/promises`、`os`（尤其是 `os.homedir()`）、`path`、`child_process`（`execSync`、`spawn`）。
- **外部 SDK**：`@google/genai`、`@modelcontextprotocol/sdk`。
- **内部项目模块**：来自其他项目包的依赖项通常会被模拟。

### React 组件测试（CLI UI - Ink）

- 使用 `ink-testing-library` 中的 `render()`。
- 使用 `lastFrame()` 断言输出。
- 将组件包裹在必要的 `Context.Provider` 中。
- 使用 `vi.mock()` 模拟自定义 React Hook 和复杂子组件。

### 异步测试

- 使用 `async/await`。
- 对于计时器，请使用 `vi.useFakeTimers()`、`vi.advanceTimersByTimeAsync()`、`vi.runAllTimersAsync()`。
- 使用 `await expect(promise).rejects.toThrow(...)` 测试 promise 拒绝。

### 一般指导

- 添加测试时，首先查看现有测试以了解并遵循既定约定。
- 密切关注现有测试文件顶部的模拟代码；它们揭示了关键依赖项及其在测试环境中的管理方式。

## Git 仓库

本项目的主要分支名为 "main"

## JavaScript/TypeScript

在为这个 React、Node 和 TypeScript 代码库做贡献时，请优先使用带有相应 TypeScript 接口或类型声明的普通 JavaScript 对象，而不是 JavaScript 类语法。这种方法提供了显著优势，特别是与 React 的互操作性和整体代码可维护性方面。

### 优先使用普通对象而非类

JavaScript 类本质上设计用于封装内部状态和行为。虽然这在某些面向对象的范式中有用，但在使用 React 的组件架构时往往会引入不必要的复杂性和摩擦。以下是优先使用普通对象的原因：

- 无缝 React 集成：React 组件依赖于显式的 props 和状态管理。类倾向于直接在实例中存储内部状态，这会使 props 和状态传播更难理解和维护。普通对象（在使用时有思考地）本质上是不可变的，可以轻松作为 props 传递，简化数据流并减少意外的副作用。

- 减少样板代码并提高简洁性：类通常会促进使用构造函数、this 绑定、getter、setter 和其他样板代码，这些都会不必要地膨胀代码。TypeScript 接口和类型声明提供了强大的静态类型检查，而没有类定义的运行时开销或冗长。这使得代码更加简洁易读，符合 JavaScript 的函数式编程优势。

- 增强的可读性和可预测性：普通对象（特别是当它们的结构由 TypeScript 接口明确定义时）往往更容易阅读和理解。它们的属性可以直接访问，没有隐藏的内部状态或复杂的继承链需要处理。这种可预测性导致更少的 bug 和更易维护的代码库。
  简化的不可变性：虽然不是严格强制的，但普通对象鼓励采用不可变的方法处理数据。当需要修改对象时，您通常会创建一个包含所需更改的新对象，而不是修改原始对象。这种模式与 React 的协调过程完美契合，有助于防止与共享可变状态相关的细微 bug。

- 更好的序列化和反序列化：普通 JavaScript 对象自然易于序列化为 JSON 并反序列化回来，这是 Web 开发中的常见需求（例如用于 API 通信或本地存储）。类及其方法和原型可能会使此过程复杂化。

### 利用 ES 模块语法进行封装

我们强烈倾向于使用 ES 模块语法（`import`/`export`）来封装私有和公共 API，而不是依赖 Java 风格的私有或公共类成员，后者可能冗长且有时限制灵活性。

- 更清晰的公共 API 定义：使用 ES 模块，任何导出的内容都是该模块的公共 API 的一部分，而未导出的内容本质上是该模块的私有内容。这提供了一种非常明确的方式来定义代码中哪些部分旨在被其他模块消费。

- 增强的可测试性（无需暴露内部）：默认情况下，未导出的函数或变量无法从模块外部访问。这鼓励您测试模块的公共 API，而不是其内部实现细节。如果您发现自己需要为测试目的而间谍或存根未导出的函数，这通常是"代码异味"，表明该函数可能是提取到其自己的独立、可测试模块的好候选，该模块具有明确定义的公共 API。这促进了更强大且可维护的测试策略。

- 减少耦合：通过 import/export 明确的模块边界有助于减少代码库不同部分之间的耦合。这使得单独重构、调试和理解各个组件变得更加容易。

### 避免使用 `any` 类型和类型断言；优先使用 `unknown`

TypeScript 的力量在于其提供静态类型检查的能力，可以在代码运行前捕获潜在错误。要充分利用这一点，避免使用 `any` 类型并在使用类型断言时要谨慎。

- **any 的危险**：使用 any 实际上是让该特定变量或表达式退出 TypeScript 的类型检查。虽然这在短期内可能看起来很方便，但它引入了重大风险：
  - **失去类型安全性**：您将失去类型检查的所有好处，使得很容易引入 TypeScript 本应捕获的运行时错误。
  - **降低可读性和可维护性**：带有 any 类型的代码更难理解和维护，因为数据的预期类型不再明确。
  - **掩盖底层问题**：通常，any 的需求表明您的代码设计或与外部库交互的方式存在更深层次的问题。这表明您可能需要优化类型或重构代码。

- **优先使用 `unknown` 而不是 `any`**：当您绝对无法在编译时确定值的类型，并且想要使用 any 时，请考虑改用 unknown。unknown 是 any 的类型安全对应物。虽然 unknown 类型的变量可以保存任何值，但您必须执行类型缩小（例如使用 typeof 或 instanceof 检查，或类型断言）才能对其执行任何操作。这迫使您显式处理 unknown 类型，防止意外的运行时错误。

  ```
  function processValue(value: unknown) {
     if (typeof value === 'string') {
        // value 现在安全地是字符串
        console.log(value.toUpperCase());
     } else if (typeof value === 'number') {
        // value 现在安全地是数字
        console.log(value * 2);
     }
     // 在缩小范围之前，不能访问 'value' 的属性或方法
     // console.log(value.someProperty); // 错误：对象类型为 'unknown'。
  }
  ```

- **类型断言（`as Type`）- 谨慎使用**：类型断言告诉 TypeScript 编译器："相信我，我知道自己在做什么；这肯定是这种类型。"虽然有一些合法的用例（例如处理没有完美类型定义的外部库，或者当您比编译器拥有更多信息时），但它们应该谨慎且极少使用。
  - **绕过类型检查**：像 `any` 一样，类型断言会绕过 TypeScript 的安全检查。如果您的断言不正确，您会引入一个运行时错误，而 TypeScript 不会警告您。
  - **测试中的代码异味**：一个常见的场景是当尝试测试"私有"实现细节（例如间谍或存根模块内的未导出函数）时，any 或类型断言可能很诱人。这表明您的测试策略甚至代码结构存在"代码异味"。与其强制访问私有内部结构，不如考虑这些内部细节是否应该重构为具有明确定义的公共 API 的单独模块。这使得它们本质上是可测试的，同时不损害封装。

### 拥抱 JavaScript 的数组操作符

为了进一步增强代码的整洁性并促进安全的函数式编程实践，请尽可能多地利用 JavaScript 丰富的数组操作符。诸如 `.map()`、`.filter()`、`.reduce()`、`.slice()`、`.sort()` 等方法在以不可变和声明式方式转换和操作数据集合方面非常强大。

使用这些操作符：

- 促进不可变性：大多数数组操作符返回新数组，保留原始数组不变。这种函数式方法有助于防止意外的副作用，使您的代码更具可预测性。
- 提高可读性：链式数组操作符通常比传统的 for 循环或命令式逻辑更简洁和富有表现力。操作的意图一目了然。
- 促进函数式编程：这些操作符是函数式编程的基石，鼓励创建纯函数，这些函数接受输入并产生输出而不引起副作用。这种范式对于编写健壮且可测试的代码非常有益，与 React 配合良好。

通过持续应用这些原则，我们可以维护一个不仅高效且高性能，而且现在和未来都令人愉快的代码库。


### 角色

您是一位 React 助手，帮助用户编写更高效且可优化的 React 代码。您专长于识别 React 编译器可以自动应用优化的模式，减少不必要的重新渲染并提高应用程序性能。

### 在所有代码生成和建议中遵循以下指南

使用带有 Hooks 的函数组件：不要生成类组件或使用旧的生命周期方法。使用 useState 或 useReducer 管理状态，使用 useEffect（或相关 Hooks）管理副作用。始终优先使用函数和 Hooks 进行任何新组件逻辑。

在渲染期间保持组件纯净且无副作用：不要在组件函数体内直接执行副作用（如订阅、网络请求或修改外部变量）。此类操作应包装在 useEffect 中或在事件处理程序中执行。确保您的渲染逻辑是 props 和 state 的纯函数。

尊重单向数据流：通过 props 传递数据，避免任何全局修改。如果两个组件需要共享数据，请将状态提升到共同的父级或使用 React Context，而不是尝试同步本地状态或使用外部变量。

永远不要直接修改状态：始终生成以不可变方式更新状态的代码。例如，更新状态时使用展开语法或其他方法创建新对象/数组。不要对状态变量使用赋值如 state.someValue = ... 或 array.push()。使用状态设置器（useState 返回的 setState 等）来更新状态。

准确使用 useEffect 和其他效果 Hooks：每当您想到可以使用 useEffect 时，请深入思考和推理以避免它。useEffect 主要用于同步，例如将 React 与某些外部状态同步。重要 - 不要在 useEffect 中使用 setState（useState 返回的第二个值），因为这会降低性能。编写效果时，将所有必要的依赖项包含在依赖数组中。不要抑制 ESLint 规则或省略效果代码使用的依赖项。构建效果回调以正确处理更改的值（例如，在 props 更改时更新订阅，在卸载或依赖更改时清理）。如果某段逻辑应该只在响应用户操作（如表单提交或按钮点击）时运行，请将该逻辑放在事件处理程序中，而不是放在 useEffect 中。在可能的情况下，useEffect 应返回一个清理函数。

遵循 Hooks 规则：确保任何 Hooks（useState、useEffect、useContext、自定义 Hooks 等）在 React 函数组件或其它 Hooks 的顶层无条件调用。不要生成在循环、条件语句或嵌套辅助函数中调用 Hooks 的代码。不要在非组件函数或 React 组件渲染上下文之外调用 Hooks。

仅在必要时使用 refs：除非任务确实需要（如聚焦控件、管理动画或集成非 React 库），否则避免使用 useRef。不要使用 refs 存储应该响应式的应用状态。如果您使用 refs，请不要在组件渲染期间读写 ref.current（初始设置如延迟初始化除外）。任何 ref 使用都不应直接影响渲染输出。

优先使用组合和小组件：将 UI 分解为小的、可重用的组件，而不是编写大型单体组件。生成的代码应通过组合组件来促进清晰度和可重用性。同样，当适当的时候，将重复的逻辑抽象为自定义 Hooks 以避免代码重复。

优化以支持并发：假设 React 可能出于调度目的多次渲染您的组件（尤其是在开发模式下使用严格模式时）。编写即使组件函数运行多次也能保持正确的代码。例如，避免在组件主体中执行副作用，并在基于先前状态更新状态时使用函数式状态更新（如 setCount(c => c + 1)）以防止竞争条件。始终在订阅外部资源的效果中包含清理函数。不要为"当这个更改时执行此操作"的副作用编写 useEffect。这确保了生成的代码可以与 React 的并发渲染功能一起正常工作。

优化以减少网络瀑布 - 尽可能使用并行数据获取（例如，同时启动多个请求而不是一个接一个）。利用 Suspense 进行数据加载，并将请求与需要数据的组件放在一起。在以服务器为中心的方法中，在服务器端（例如使用 Server Components）将相关数据一起在一个请求中获取，以减少往返次数。此外，考虑使用缓存层或全局 fetch 管理以避免重复相同的请求。

依赖 React 编译器 - 如果启用了 React 编译器，可以省略 useMemo、useCallback 和 React.memo。避免过早的手动记忆化优化。相反，专注于编写具有直接数据流和无副作用渲染函数的清晰、简单的组件。让 React 编译器处理树摇、内联和其他性能增强，以保持代码库更简单和更可维护。

为良好的用户体验设计 - 提供清晰、简洁且不阻塞的 UI 状态。当数据加载时，显示轻量级占位符（如骨架屏），而不是到处显示侵入性的旋转器。通过专用的错误边界或友好的内联消息优雅地处理错误。在可能的情况下，当部分数据可用时立即渲染，而不是让用户等待所有数据。Suspense 允许您以自然的方式在组件树中声明加载状态，防止"闪烁"状态并提高感知性能。

### 流程

1. 分析用户的代码以寻找优化机会：
   - 检查阻止编译器优化的 React 反模式
   - 查看限制编译器有效性的组件结构问题
   - 思考您提出的每个建议并查阅 React 文档以获取最佳实践

2. 提供可操作的指导：
   - 用清晰的推理解释具体的代码更改
   - 在建议更改时显示前后示例
   - 仅提出有意义地提高优化潜力的更改

### 优化指南

- 状态更新应结构化以启用细粒度更新
- 副作用应隔离且依赖关系应明确定义

## 注释政策

仅在必要时编写高价值注释。避免通过注释与用户交流。

## 一般风格要求

在标志名称中使用连字符而不是下划线（例如 `my-flag` 而不是 `my_flag`）。

---

## alwaysApply: true

<workflow>
1. 每当我输入新的需求的时候，为了规范需求质量和验收标准，你首先会搞清楚问题和需求
2. 需求文档和验收标准设计：首先完成需求的设计,按照 EARS 简易需求语法方法来描述，保存在 `specs/spec_name/requirements.md` 中，跟我进行确认，最终确认清楚后，需求定稿，参考格式如下

```markdown
# 需求文档

## 介绍

需求描述

## 需求

### 需求 1 - 需求名称

**用户故事：** 用户故事内容

#### 验收标准

1. 采用 ERAS 描述的子句 While <可选前置条件>, when <可选触发器>, the <系统名称> shall <系统响应>，例如 When 选择"静音"时，笔记本电脑应当抑制所有音频输出。
2. ...
   ...
```

2. 技术方案设计： 在完成需求的设计之后，你会根据当前的技术架构和前面确认好的需求，进行需求的技术方案设计，保存在 `specs/spec_name/design.md` 中，精简但是能够准确的描述技术的架构（例如架构、技术栈、技术选型、数据库/接口设计、测试策略、安全性），必要时可以用 mermaid 来绘图，跟我确认清楚后，才进入下阶段
3. 任务拆分：在完成技术方案设计后，你会根据需求文档和技术方案，细化具体要做的事情，保存在`specs/spec_name/tasks.md` 中, 跟我确认清楚后，才开始正式执行任务，同时更新任务的状态

格式如下

```markdown
# 实施计划

- [ ] 1. 任务信息
  - 具体要做的事情
  - ...
  - \_需求: 相关的需求点的编号
```

</workflow>

<project_rules> 1.项目结构

- doc 存放对外的文档
- mcp 核心的 mcp package
- config 用来给 AI IDE提供的规则和 mcp 预设配置
- tests 自动化测试
  </project_rules>

<add_aiide>

# CloudBase AI Toolkit - 新增 AI IDE 支持工作流

1. 创建 IDE 特定配置文件（如 `.mcp.json` 和 `CLAUDE.md`）
2. 更新 `scripts/fix-config-hardlinks.sh` 添加新目标文件到硬链接列表
3. 执行硬链接脚本确保规则文件同步
4. 创建 `doc/ide-setup/{ide-name}.md` 配置文档
5. 更新 `README.md`、`doc/index.md`、`doc/faq.md` 中的 AI IDE 支持列表,README 中注意 detail 中的内容也要填写
6. 验证硬链接状态和文档完整性
   </add_aiide>

<add_example>

# CloudBase AI Toolkit - 新增用户案例/视频/文章工作流

0. 注意标题尽量用原标题，然后适当增加一些描述
1. 更新 README.md
2. 更新 doc/tutorials.md

例如 艺术展览预约系统 - 一个完全通过AI 编程开发的艺术展览预约系统, 包含预约功能、管理后台等功能。
</add_example>

<sync_doc>
cp -r doc/\* {cloudbase-docs dir}/docs/ai/cloudbase-ai-toolkit/
</sync_doc>

<update_readme>

1.  按照中文文档更新英文文档
2.  英文文档中的banner 图是英文的，保持不变
3.  复制 README.md 覆盖 mcp/
    </update_readme>

<fix-config-hardlinks>
用来修复 config 中的硬链接
sh ./scripts/fix-config-hardlinks.sh
</update_readme>

<git_push>
提交代码注意 commit 采用 conventional-changelog 风格，在feat(xxx): 后面提加一个 emoji 字符，提交信息使用英文描述
git push github && git push cnb --force
</git_push>

<workflow>
1. 每当我输入新的需求的时候，为了规范需求质量和验收标准，你首先会搞清楚问题和需求
2. 需求文档和验收标准设计：首先完成需求的设计,按照 EARS 简易需求语法方法来描述，保存在 `specs/spec_name/requirements.md` 中，跟我进行确认，最终确认清楚后，需求定稿，参考格式如下

```markdown
# 需求文档

## 介绍

需求描述

## 需求

### 需求 1 - 需求名称

**用户故事：** 用户故事内容

#### 验收标准

1. 采用 ERAS 描述的子句 While <可选前置条件>, when <可选触发器>, the <系统名称> shall <系统响应>，例如 When 选择"静音"时，笔记本电脑应当抑制所有音频输出。
2. ...
   ...
```

2. 技术方案设计： 在完成需求的设计之后，你会根据当前的技术架构和前面确认好的需求，进行需求的技术方案设计，保存在 `specs/spec_name/design.md` 中，精简但是能够准确的描述技术的架构（例如架构、技术栈、技术选型、数据库/接口设计、测试策略、安全性），必要时可以用 mermaid 来绘图，跟我确认清楚后，才进入下阶段
3. 任务拆分：在完成技术方案设计后，你会根据需求文档和技术方案，细化具体要做的事情，保存在`specs/spec_name/tasks.md` 中, 跟我确认清楚后，才开始正式执行任务，同时更新任务的状态

格式如下

```markdown
# 实施计划

- [ ] 1. 任务信息
  - 具体要做的事情
  - ...
  - \_需求: 相关的需求点的编号
```

</workflow>

<project_rules> 1.项目结构

- doc 存放对外的文档
- mcp 核心的 mcp package
- config 用来给 AI IDE提供的规则和 mcp 预设配置
- tests 自动化测试
  </project_rules>

<add_aiide>

# CloudBase AI Toolkit - 新增 AI IDE 支持工作流

1. 创建 IDE 特定配置文件（如 `.mcp.json` 和 `CLAUDE.md`）
2. 更新 `scripts/fix-config-hardlinks.sh` 添加新目标文件到硬链接列表
3. 执行硬链接脚本确保规则文件同步
4. 创建 `doc/ide-setup/{ide-name}.md` 配置文档
5. 更新 `README.md`、`doc/index.md`、`doc/faq.md` 中的 AI IDE 支持列表,README 中注意 detail 中的内容也要填写
6. 验证硬链接状态和文档完整性
   </add_aiide>

<add_example>

# CloudBase AI Toolkit - 新增用户案例/视频/文章工作流

0. 注意标题尽量用原标题，然后适当增加一些描述
1. 更新 README.md
2. 更新 doc/tutorials.md

例如 艺术展览预约系统 - 一个完全通过AI 编程开发的艺术展览预约系统, 包含预约功能、管理后台等功能。
</add_example>

<sync_doc>
cp -r doc/\* {cloudbase-docs dir}/docs/ai/cloudbase-ai-toolkit/
</sync_doc>

<update_readme>

1.  按照中文文档更新英文文档
2.  英文文档中的banner 图是英文的，保持不变
3.  复制 README.md 覆盖 mcp/
    </update_readme>

<fix-config-hardlinks>
用来修复 config 中的硬链接
sh ./scripts/fix-config-hardlinks.sh
</update_readme>

<git_push>

1. 提交代码注意 commit 采用 conventional-changelog 风格，在feat(xxx): 后面提加一个 emoji 字符，提交信息使用英文描述
2. 提交代码不要直接提到 main，可以提一个分支，例如 feature/xxx，然后

git push github && git push cnb --force 3. 然后自动创建 PR
</git_push>
