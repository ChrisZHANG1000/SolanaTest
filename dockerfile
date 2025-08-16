# ---------- 编译阶段 ----------
FROM rust:1.80-slim-bullseye as builder

# 安装 Solana CLI + Anchor CLI
ENV SOLANA_VERSION=v1.18.15
ENV ANCHOR_VERSION=0.30.1
RUN apt-get update && apt-get install -y curl pkg-config build-essential libudev-dev \
 && curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh -s -- -y
ENV PATH="/root/.cargo/bin:$PATH"

# Solana
RUN sh -c "$(curl -sSfL https://release.solana.com/${SOLANA_VERSION}/install)"
ENV PATH="/root/.local/share/solana/install/active_release/bin:$PATH"

# Anchor
RUN cargo install --git https://github.com/coral-xyz/anchor \
  --tag v${ANCHOR_VERSION} anchor-cli --locked

WORKDIR /workspace
COPY program .
RUN anchor build

# ---------- 运行阶段 ----------
FROM node:20-slim

# 容器里同时起验证器 + 测试，需要 solana CLI 和 node
ENV SOLANA_VERSION=v1.18.15
RUN apt-get update && apt-get install -y curl build-essential && \
    sh -c "$(curl -sSfL https://release.solana.com/${SOLANA_VERSION}/install)"
ENV PATH="/root/.local/share/solana/install/active_release/bin:$PATH"

WORKDIR /app
# 拷贝程序产物
COPY --from=builder /workspace/target/deploy/ ./target/deploy/
# 拷贝链下测试
COPY tests/ ./tests/
COPY package.json tsconfig.json ./
RUN npm ci
EXPOSE 8899 8900
CMD ["sh", "-c", "\
    solana-test-validator --reset --quiet & \
    sleep 5 && \
    solana config set --url http://localhost:8899 && \
    solana program deploy target/deploy/susdc.so && \
    npx ts-mocha -p ./tsconfig.json -t 1000000 tests/susdc.ts \
"]
