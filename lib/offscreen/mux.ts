import {
  ALL_FORMATS,
  BufferSource,
  BufferTarget,
  EncodedAudioPacketSource,
  EncodedPacketSink,
  EncodedVideoPacketSource,
  Input,
  Mp4OutputFormat,
  Output,
} from 'mediabunny';

/**
 * Склеивает отдельные дорожки видео и звука в один mp4 без перекодирования:
 * пакеты просто переносятся из двух файлов в один, поэтому быстро и без потери качества.
 */
export async function muxVideoAudio(video: ArrayBuffer, audio: ArrayBuffer): Promise<ArrayBuffer> {
  const videoInput = new Input({ source: new BufferSource(video), formats: ALL_FORMATS });
  const audioInput = new Input({ source: new BufferSource(audio), formats: ALL_FORMATS });
  const videoTrack = await videoInput.getPrimaryVideoTrack();
  const audioTrack = await audioInput.getPrimaryAudioTrack();
  if (!videoTrack?.codec) throw new Error('в видеодорожке нет видео');
  if (!audioTrack?.codec) throw new Error('в аудиодорожке нет звука');

  const target = new BufferTarget();
  // fastStart: оглавление файла в начале, чтобы видео сразу играло в любом плеере
  const output = new Output({ format: new Mp4OutputFormat({ fastStart: 'in-memory' }), target });
  const videoSource = new EncodedVideoPacketSource(videoTrack.codec);
  const audioSource = new EncodedAudioPacketSource(audioTrack.codec);
  output.addVideoTrack(videoSource, { rotation: videoTrack.rotation });
  output.addAudioTrack(audioSource);
  await output.start();

  const videoConfig = await videoTrack.getDecoderConfig();
  const audioConfig = await audioTrack.getDecoderConfig();

  // Дорожки пишем параллельно: мультиплексор сам раскладывает пакеты по времени
  await Promise.all([
    (async () => {
      let first = true;
      for await (const packet of new EncodedPacketSink(videoTrack).packets()) {
        await videoSource.add(
          packet,
          first && videoConfig ? { decoderConfig: videoConfig } : undefined,
        );
        first = false;
      }
      videoSource.close();
    })(),
    (async () => {
      let first = true;
      for await (const packet of new EncodedPacketSink(audioTrack).packets()) {
        await audioSource.add(
          packet,
          first && audioConfig ? { decoderConfig: audioConfig } : undefined,
        );
        first = false;
      }
      audioSource.close();
    })(),
  ]);

  await output.finalize();
  if (!target.buffer) throw new Error('склейка не дала файла');
  return target.buffer;
}
