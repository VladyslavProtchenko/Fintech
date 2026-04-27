FROM nvidia/cuda:12.6.0-cudnn-runtime-ubuntu22.04

RUN apt-get update && apt-get install -y python3.12 python3.12-venv && rm -rf /var/lib/apt/lists/*

WORKDIR /app
COPY requirements.txt .
RUN python3.12 -m venv /opt/venv \
    && /opt/venv/bin/pip install --no-cache-dir --upgrade pip \
    && /opt/venv/bin/pip install --no-cache-dir -r requirements.txt

COPY . .
ENV PATH="/opt/venv/bin:$PATH"

CMD ["python3.12", "-m", "app.main"]
