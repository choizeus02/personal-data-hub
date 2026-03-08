FROM prefecthq/prefect:3-latest

WORKDIR /app

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY flows/ ./flows/

ENV PYTHONUNBUFFERED=1
ENV PYTHONPATH=/app/flows
