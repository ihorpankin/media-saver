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
 * Muxes separate video and audio tracks into one mp4 without re-encoding:
 * packets are simply moved from two files into one, so it's fast and lossless.
 */
export async function muxVideoAudio(video: ArrayBuffer, audio: ArrayBuffer): Promise<ArrayBuffer> {
  const videoInput = new Input({ source: new BufferSource(video), formats: ALL_FORMATS });
  const audioInput = new Input({ source: new BufferSource(audio), formats: ALL_FORMATS });
  const videoTrack = await videoInput.getPrimaryVideoTrack();
  const audioTrack = await audioInput.getPrimaryAudioTrack();
  if (!videoTrack?.codec) throw new Error('video track has no video');
  if (!audioTrack?.codec) throw new Error('audio track has no audio');

  const target = new BufferTarget();
  // fastStart: the file index at the beginning, so the video plays right away in any player
  const output = new Output({ format: new Mp4OutputFormat({ fastStart: 'in-memory' }), target });
  const videoSource = new EncodedVideoPacketSource(videoTrack.codec);
  const audioSource = new EncodedAudioPacketSource(audioTrack.codec);
  output.addVideoTrack(videoSource, { rotation: videoTrack.rotation });
  output.addAudioTrack(audioSource);
  await output.start();

  const videoConfig = await videoTrack.getDecoderConfig();
  const audioConfig = await audioTrack.getDecoderConfig();

  // Tracks are written in parallel: the muxer orders the packets by time itself
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
  if (!target.buffer) throw new Error('muxing produced no file');
  return target.buffer;
}
