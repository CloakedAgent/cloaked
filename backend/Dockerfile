# Backend Dockerfile with ZK Prover Tools
FROM node:20-bookworm

WORKDIR /app

# Install system dependencies for ZK tools
RUN apt-get update && apt-get install -y \
    curl \
    git \
    build-essential \
    && rm -rf /var/lib/apt/lists/*

# Install Go 1.22.10 (required for Sunspot)
RUN curl -LO https://go.dev/dl/go1.22.10.linux-amd64.tar.gz && \
    tar -C /usr/local -xzf go1.22.10.linux-amd64.tar.gz && \
    rm go1.22.10.linux-amd64.tar.gz
ENV PATH="/usr/local/go/bin:${PATH}"

# Install Nargo (Noir compiler)
RUN curl -L https://raw.githubusercontent.com/noir-lang/noirup/main/install | bash
ENV PATH="/root/.nargo/bin:${PATH}"
RUN /root/.nargo/bin/noirup -v 1.0.0-beta.18

# Install Sunspot (ZK prover) - Go code is in sunspot/go directory
RUN git clone https://github.com/reilabs/sunspot.git /tmp/sunspot && \
    cd /tmp/sunspot/go && \
    go build -o /usr/local/bin/sunspot . && \
    rm -rf /tmp/sunspot

# Set ZK tool paths as environment variables
ENV NARGO_PATH="/root/.nargo/bin/nargo"
ENV SUNSPOT_PATH="/usr/local/bin/sunspot"

# Install Node dependencies (need devDeps for TypeScript build)
COPY package*.json ./
RUN npm ci

# Copy source and build
COPY . .
RUN npm run build

# Remove devDependencies after build
RUN npm prune --omit=dev

EXPOSE 3645

CMD ["node", "dist/index.js"]
