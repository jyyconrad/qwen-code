#!/bin/bash
set -euo pipefail

# 初始化一个逗号分隔的字符串，用于保存需要评论的 PR 编号
PRS_NEEDING_COMMENT=""

# 处理单个 PR 的函数
process_pr() {
    local PR_NUMBER=$1
    echo "🔄 正在处理 PR #$PR_NUMBER"

    # 获取 PR 内容并进行错误处理
    local PR_BODY
    if ! PR_BODY=$(gh pr view "$PR_NUMBER" --repo "$GITHUB_REPOSITORY" --json body -q .body 2>/dev/null); then
        echo "   ⚠️ 无法获取 PR #$PR_NUMBER 的详细信息"
        return 1
    fi

    # 使用多种模式查找关联的 issue
    local ISSUE_NUMBER=""

    # 模式 1: 直接引用如 #123
    if [ -z "$ISSUE_NUMBER" ]; then
        ISSUE_NUMBER=$(echo "$PR_BODY" | grep -oE '#[0-9]+' | head -1 | sed 's/#//' 2>/dev/null || echo "")
    fi

    # 模式 2: Closes/Fixes/Resolves 模式（不区分大小写）
    if [ -z "$ISSUE_NUMBER" ]; then
        ISSUE_NUMBER=$(echo "$PR_BODY" | grep -iE '(closes?|fixes?|resolves?) #[0-9]+' | grep -oE '#[0-9]+' | head -1 | sed 's/#//' 2>/dev/null || echo "")
    fi

    if [ -z "$ISSUE_NUMBER" ]; then
        echo "⚠️ 未找到 PR #$PR_NUMBER 关联的 issue，正在添加标签 status/need-issue"
        if ! gh pr edit "$PR_NUMBER" --repo "$GITHUB_REPOSITORY" --add-label "status/need-issue" 2>/dev/null; then
            echo "   ⚠️ 添加标签失败（可能已存在或权限问题）"
        fi
        # 将 PR 编号添加到列表中
        if [ -z "$PRS_NEEDING_COMMENT" ]; then
            PRS_NEEDING_COMMENT="$PR_NUMBER"
        else
            PRS_NEEDING_COMMENT="$PRS_NEEDING_COMMENT,$PR_NUMBER"
        fi
        echo "needs_comment=true" >> $GITHUB_OUTPUT
    else
        echo "🔗 找到关联的 issue #$ISSUE_NUMBER"

        # 如果存在则移除 status/need-issue 标签
        if ! gh pr edit "$PR_NUMBER" --repo "$GITHUB_REPOSITORY" --remove-label "status/need-issue" 2>/dev/null; then
            echo "   status/need-issue 标签不存在或无法移除"
        fi

        # 获取 issue 标签
        echo "📥 正在获取 issue #$ISSUE_NUMBER 的标签"
        local ISSUE_LABELS=""
        if ! ISSUE_LABELS=$(gh issue view "$ISSUE_NUMBER" --repo "$GITHUB_REPOSITORY" --json labels -q '.labels[].name' 2>/dev/null | tr '\n' ',' | sed 's/,$//' || echo ""); then
            echo "   ⚠️ 无法获取 issue #$ISSUE_NUMBER（可能不存在或在不同仓库中）"
            ISSUE_LABELS=""
        fi

        # 获取 PR 标签
        echo "📥 正在获取 PR #$PR_NUMBER 的标签"
        local PR_LABELS=""
        if ! PR_LABELS=$(gh pr view "$PR_NUMBER" --repo "$GITHUB_REPOSITORY" --json labels -q '.labels[].name' 2>/dev/null | tr '\n' ',' | sed 's/,$//' || echo ""); then
            echo "   ⚠️ 无法获取 PR 标签"
            PR_LABELS=""
        fi

        echo "   Issue 标签: $ISSUE_LABELS"
        echo "   PR 标签: $PR_LABELS"

        # 将逗号分隔的字符串转换为数组
        local ISSUE_LABEL_ARRAY PR_LABEL_ARRAY
        IFS=',' read -ra ISSUE_LABEL_ARRAY <<< "$ISSUE_LABELS"
        IFS=',' read -ra PR_LABEL_ARRAY <<< "$PR_LABELS"

        # 查找需要添加的标签（在 issue 上但不在 PR 上）
        local LABELS_TO_ADD=""
        for label in "${ISSUE_LABEL_ARRAY[@]}"; do
            if [ -n "$label" ] && [[ ! " ${PR_LABEL_ARRAY[*]} " =~ " ${label} " ]]; then
                if [ -z "$LABELS_TO_ADD" ]; then
                    LABELS_TO_ADD="$label"
                else
                    LABELS_TO_ADD="$LABELS_TO_ADD,$label"
                fi
            fi
        done

        # 查找需要移除的标签（在 PR 上但不在 issue 上）
        local LABELS_TO_REMOVE=""
        for label in "${PR_LABEL_ARRAY[@]}"; do
            if [ -n "$label" ] && [[ ! " ${ISSUE_LABEL_ARRAY[*]} " =~ " ${label} " ]]; then
                # 不要移除 status/need-issue，因为我们已经处理过了
                if [ "$label" != "status/need-issue" ]; then
                    if [ -z "$LABELS_TO_REMOVE" ]; then
                        LABELS_TO_REMOVE="$label"
                    else
                        LABELS_TO_REMOVE="$LABELS_TO_REMOVE,$label"
                    fi
                fi
            fi
        done

        # 应用标签更改
        if [ -n "$LABELS_TO_ADD" ]; then
            echo "➕ 正在添加标签: $LABELS_TO_ADD"
            if ! gh pr edit "$PR_NUMBER" --repo "$GITHUB_REPOSITORY" --add-label "$LABELS_TO_ADD" 2>/dev/null; then
                echo "   ⚠️ 部分标签添加失败"
            fi
        fi

        if [ -n "$LABELS_TO_REMOVE" ]; then
            echo "➖ 正在移除标签: $LABELS_TO_REMOVE"
            if ! gh pr edit "$PR_NUMBER" --repo "$GITHUB_REPOSITORY" --remove-label "$LABELS_TO_REMOVE" 2>/dev/null; then
                echo "   ⚠️ 部分标签移除失败"
            fi
        fi

        if [ -z "$LABELS_TO_ADD" ] && [ -z "$LABELS_TO_REMOVE" ]; then
            echo "✅ 标签已同步"
        fi
        echo "needs_comment=false" >> $GITHUB_OUTPUT
    fi
}

# 如果设置了 PR_NUMBER，则只处理该 PR
if [ -n "${PR_NUMBER:-}" ]; then
    if ! process_pr "$PR_NUMBER"; then
        echo "❌ 处理 PR #$PR_NUMBER 失败"
        exit 1
    fi
else
    # 否则，获取所有开放的 PR 并处理它们
    # 脚本逻辑将确定哪些需要 issue 链接或标签同步
    echo "📥 正在获取所有开放的拉取请求..."
    if ! PR_NUMBERS=$(gh pr list --repo "$GITHUB_REPOSITORY" --state open --limit 1000 --json number -q '.[].number' 2>/dev/null); then
        echo "❌ 获取 PR 列表失败"
        exit 1
    fi
    
    if [ -z "$PR_NUMBERS" ]; then
        echo "✅ 未找到开放的 PR"
    else
        # 计算 PR 数量
        PR_COUNT=$(echo "$PR_NUMBERS" | wc -w | tr -d ' ')
        echo "📊 找到 $PR_COUNT 个开放的 PR 需要处理"
        
        for pr_number in $PR_NUMBERS; do
            if ! process_pr "$pr_number"; then
                echo "⚠️ 处理 PR #$pr_number 失败，继续处理下一个 PR..."
                continue
            fi
        done
    fi
fi

# 确保输出始终被设置，即使为空
if [ -z "$PRS_NEEDING_COMMENT" ]; then
    echo "prs_needing_comment=[]" >> $GITHUB_OUTPUT
else
    echo "prs_needing_comment=[$PRS_NEEDING_COMMENT]" >> $GITHUB_OUTPUT
fi

echo "✅ PR 分类处理完成"