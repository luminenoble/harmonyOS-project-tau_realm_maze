# git-format

## 提交信息格式

```
<type>[(<scope>)]: <subject>

[body]

[footer]
```

| 字段 | 是否必填 | 说明 |
|------|----------|------|
| `type` | 必填 | 提交类型，见下方类型表 |
| `scope` | 可选 | 影响范围，如模块名、文件名 |
| `subject` | 必填 | 简短描述，不超过 72 字符，不加句号 |
| `body` | 可选 | 详细说明，解释「做了什么」和「为什么」 |
| `footer` | 可选 | 关联 Issue、Breaking Change 等 |

---

### Type 类型说明

| Type | 说明 | 示例 |
|------|------|------|
| `feat` | 新增功能 | `feat(auth): 添加 OAuth2 登录` |
| `fix` | 修复 Bug | `fix(api): 修复分页参数越界问题` |
| `docs` | 文档变更 | `docs: 更新 README 安装说明` |
| `style` | 代码格式调整（不影响逻辑） | `style: 统一缩进为 2 空格` |
| `refactor` | 重构（非新功能、非修 Bug） | `refactor(user): 拆分 UserService` |
| `test` | 添加或修改测试 | `test(cart): 补充购物车边界测试` |
| `revert` | 回滚提交 | `revert: feat(auth): 添加 OAuth2 登录` |
| `build` | 构建系统或外部依赖变更 | `build: 迁移至 pnpm` |

---

### Breaking Change（破坏性变更）

在 `footer` 中使用 `BREAKING CHANGE:` 标注，或在 type 后加 `!`：

```
feat(api)!: 移除 v1 接口

BREAKING CHANGE: /api/v1/* 全部下线，请迁移至 /api/v2/*
```

---

## 分支命名规范

```
<type>/<简短描述>
```

| 示例分支名 | 说明 |
|------------|------|
| `feat/user-login` | 新增用户登录功能 |
| `fix/order-null-pointer` | 修复订单空指针 |
| `hotfix/payment-crash` | 紧急修复支付崩溃 |
| `docs/api-reference` | 更新 API 文档 |
| `release/v2.3.0` | 版本发布分支 |
| `dev/refactor-service` | 开发中的重构分支 |
